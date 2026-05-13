import { z } from "zod";

import { env } from "../../../lib/env";
import { isHmacSignatureValid } from "../../../lib/hmac-signature";
import {
  recordHubSpotWebhookEvents,
  type RecordHubSpotWebhookEventInput,
} from "./mutations";
import { enqueueHubSpotWebhookProcessingJobs } from "./processing-queue";
import {
  createHubSpotWebhookEventDedupeKey,
} from "./webhook-event-utils";
import { decodeHubSpotSignatureUri } from "./webhook-signature-uri";

const HUBSPOT_SIGNATURE_MAX_AGE_MS = 5 * 60 * 1000;
const HUBSPOT_CONTACT_OBJECT_TYPE_ID = "0-1";
const rawHubSpotWebhookEventSchema = z.object({}).catchall(z.unknown());
const hubSpotWebhookBatchSchema = z
  .array(rawHubSpotWebhookEventSchema)
  .nonempty();
const stringishSchema = z
  .union([
    z.string().min(1),
    z.number().refine(Number.isSafeInteger).transform(String),
  ]);
const nullableStringishSchema = stringishSchema
  .nullish()
  .transform((value) => value ?? null)
  .catch(null);
const occurredAtSchema = z
  .number()
  .refine(Number.isSafeInteger)
  .transform((value) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  })
  .catch(null);
const contactCreatedWebhookEventSchema = rawHubSpotWebhookEventSchema.extend({
  objectId: stringishSchema,
  objectTypeId: z.literal(HUBSPOT_CONTACT_OBJECT_TYPE_ID),
  occurredAt: occurredAtSchema,
  portalId: nullableStringishSchema,
  subscriptionType: z.literal("object.creation"),
});
const conversationMessageWebhookEventSchema =
  rawHubSpotWebhookEventSchema.extend({
    messageId: stringishSchema,
    messageType: z.literal("MESSAGE"),
    objectId: stringishSchema,
    occurredAt: occurredAtSchema,
    portalId: nullableStringishSchema,
    subscriptionType: z.literal("conversation.newMessage"),
  });

export type HubSpotWebhookEvent = z.infer<typeof rawHubSpotWebhookEventSchema>;

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
};

export type HubSpotWebhookBatchReceipt = {
  events: HubSpotWebhookEvent[];
  acceptedEventCount: number;
  persistedEventCount: number;
  enqueuedProcessingJobCount: number;
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
}: ReceiveHubSpotWebhookBatchInput): Promise<HubSpotWebhookBatchReceipt> {
  const now = new Date();

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

  const { persistedEventCount, processingJobCandidates } =
    await recordHubSpotWebhookEvents(targetEvents, now);
  const enqueuedProcessingJobCount = await enqueueHubSpotWebhookProcessingJobs(
    processingJobCandidates,
  );

  console.info("Accepted HubSpot Webhook Batch", {
    eventCount: events.length,
    persistedEventCount,
    enqueuedProcessingJobCount,
  });

  return {
    events,
    acceptedEventCount: events.length,
    persistedEventCount,
    enqueuedProcessingJobCount,
  };
}

type NormalizedTargetHubSpotWebhookEvent = RecordHubSpotWebhookEventInput;

function normalizeHubSpotWebhookEvent(
  rawWebhook: HubSpotWebhookEvent,
): NormalizedTargetHubSpotWebhookEvent | null {
  const contactCreated = contactCreatedWebhookEventSchema.safeParse(rawWebhook);
  if (contactCreated.success) {
    const normalizedEvent: NormalizedHubSpotWebhookEvent = {
      type: "contact.created",
      hubSpotObjectId: contactCreated.data.objectId,
      hubSpotPortalId: contactCreated.data.portalId,
      occurredAt: contactCreated.data.occurredAt,
    };

    return {
      rawWebhook,
      normalizedEvent,
      dedupeKey: createHubSpotWebhookEventDedupeKey(rawWebhook),
    };
  }

  const conversationMessage =
    conversationMessageWebhookEventSchema.safeParse(rawWebhook);
  if (conversationMessage.success) {
    const normalizedEvent: NormalizedHubSpotWebhookEvent = {
      type: "conversation.message.received",
      hubSpotObjectId: conversationMessage.data.objectId,
      hubSpotPortalId: conversationMessage.data.portalId,
      occurredAt: conversationMessage.data.occurredAt,
      hubSpotMessageId: conversationMessage.data.messageId,
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

  const result = hubSpotWebhookBatchSchema.safeParse(parsed);
  if (result.success) {
    return result.data;
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new HubSpotWebhookReceiptError(
      "HubSpot Webhook Batch must be a non-empty array",
      "bad_request",
    );
  }

  throw new HubSpotWebhookReceiptError(
    "HubSpot Webhook Batch must contain only object events",
    "bad_request",
  );
}
