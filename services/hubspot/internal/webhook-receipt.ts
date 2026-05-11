import { env } from "../../../lib/env";
import { isHmacSignatureValid } from "../../../lib/hmac-signature";
import {
  recordHubSpotWebhookEvents,
  type RecordHubSpotWebhookEventInput,
} from "./mutations";
import {
  createHubSpotWebhookEventDedupeKey,
  normalizeHubSpotOccurredAt,
  readStringish,
} from "./webhook-event-utils";
import { decodeHubSpotSignatureUri } from "./webhook-signature-uri";

const HUBSPOT_SIGNATURE_MAX_AGE_MS = 5 * 60 * 1000;
const HUBSPOT_CONTACT_OBJECT_TYPE_ID = "0-1";

export type HubSpotWebhookEvent = Record<string, unknown>;

export type NormalizedHubSpotWebhookEvent = {
  type: "contact.created" | "conversation.message.received";
  hubSpotObjectId: string;
  hubSpotPortalId: string | null;
  occurredAt: string | null;
  hubSpotMessageId?: string;
};

export type ReceiveHubSpotWebhookBatchInput = {
  method: string;
  webhookUrl: string;
  rawBody: string;
  signature: string | null;
  timestamp: string | null;
  now?: Date;
};

export type HubSpotWebhookBatchReceipt = {
  events: HubSpotWebhookEvent[];
  acceptedEventCount: number;
  persistedEventCount: number;
};

export class HubSpotWebhookReceiptError extends Error {
  constructor(
    message: string,
    public readonly reason: "unauthorized" | "bad_request",
  ) {
    super(message);
    this.name = "HubSpotWebhookReceiptError";
  }
}

export async function receiveHubSpotWebhookBatch({
  method,
  webhookUrl,
  rawBody,
  signature,
  timestamp,
  now = new Date(),
}: ReceiveHubSpotWebhookBatchInput): Promise<HubSpotWebhookBatchReceipt> {
  verifyHubSpotSignature({
    method,
    webhookUrl,
    rawBody,
    signature,
    timestamp,
    now,
  });

  const events = parseHubSpotWebhookBatch(rawBody);
  const targetEvents = events
    .map(normalizeHubSpotWebhookEvent)
    .filter((event): event is NormalizedTargetHubSpotWebhookEvent => event !== null);

  for (const event of targetEvents) {
    console.info("Received target HubSpot Webhook Event", event.normalizedEvent);
  }

  const persistedEventCount = await recordHubSpotWebhookEvents(targetEvents, now);

  console.info("Accepted HubSpot Webhook Batch", {
    eventCount: events.length,
    persistedEventCount,
  });

  return {
    events,
    acceptedEventCount: events.length,
    persistedEventCount,
  };
}

type NormalizedTargetHubSpotWebhookEvent = RecordHubSpotWebhookEventInput;

function normalizeHubSpotWebhookEvent(
  rawWebhook: HubSpotWebhookEvent,
): NormalizedTargetHubSpotWebhookEvent | null {
  const subscriptionType = readStringish(rawWebhook.subscriptionType);

  if (
    subscriptionType === "object.creation" &&
    readStringish(rawWebhook.objectTypeId) === HUBSPOT_CONTACT_OBJECT_TYPE_ID
  ) {
    const hubSpotObjectId = readStringish(rawWebhook.objectId);
    if (!hubSpotObjectId) return null;

    const normalizedEvent: NormalizedHubSpotWebhookEvent = {
      type: "contact.created",
      hubSpotObjectId,
      hubSpotPortalId: readStringish(rawWebhook.portalId),
      occurredAt: normalizeHubSpotOccurredAt(rawWebhook.occurredAt),
    };

    return {
      rawWebhook,
      normalizedEvent,
      dedupeKey: createHubSpotWebhookEventDedupeKey(rawWebhook),
    };
  }

  if (
    subscriptionType === "conversation.newMessage" &&
    readStringish(rawWebhook.messageType) === "MESSAGE"
  ) {
    const hubSpotObjectId = readStringish(rawWebhook.objectId);
    const hubSpotMessageId = readStringish(rawWebhook.messageId);
    if (!hubSpotObjectId || !hubSpotMessageId) return null;

    const normalizedEvent: NormalizedHubSpotWebhookEvent = {
      type: "conversation.message.received",
      hubSpotObjectId,
      hubSpotPortalId: readStringish(rawWebhook.portalId),
      occurredAt: normalizeHubSpotOccurredAt(rawWebhook.occurredAt),
      hubSpotMessageId,
    };

    return {
      rawWebhook,
      normalizedEvent,
      dedupeKey: createHubSpotWebhookEventDedupeKey(rawWebhook),
    };
  }

  return null;
}

function verifyHubSpotSignature({
  method,
  webhookUrl,
  rawBody,
  signature,
  timestamp,
  now,
}: ReceiveHubSpotWebhookBatchInput & { now: Date }) {
  if (!signature || !timestamp) {
    throw new HubSpotWebhookReceiptError(
      "HubSpot webhook request is missing signature material",
      "unauthorized",
    );
  }

  const timestampMs = Number(timestamp);
  if (
    !Number.isSafeInteger(timestampMs) ||
    now.getTime() - timestampMs > HUBSPOT_SIGNATURE_MAX_AGE_MS
  ) {
    throw new HubSpotWebhookReceiptError(
      "HubSpot webhook request timestamp is invalid or stale",
      "unauthorized",
    );
  }

  const source = `${method.toUpperCase()}${decodeHubSpotSignatureUri(
    webhookUrl,
  )}${rawBody}${timestamp}`;
  if (
    !isHmacSignatureValid({
      secret: env.HUBSPOT_CLIENT_SECRET,
      source,
      signature,
    })
  ) {
    throw new HubSpotWebhookReceiptError(
      "HubSpot webhook request signature is invalid",
      "unauthorized",
    );
  }
}

function parseHubSpotWebhookBatch(rawBody: string): HubSpotWebhookEvent[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new HubSpotWebhookReceiptError(
      "HubSpot Webhook Batch must be valid JSON",
      "bad_request",
    );
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new HubSpotWebhookReceiptError(
      "HubSpot Webhook Batch must be a non-empty array",
      "bad_request",
    );
  }

  if (!parsed.every(isRawHubSpotWebhookEvent)) {
    throw new HubSpotWebhookReceiptError(
      "HubSpot Webhook Batch must contain only object events",
      "bad_request",
    );
  }

  return parsed;
}

function isRawHubSpotWebhookEvent(
  value: unknown,
): value is HubSpotWebhookEvent {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
