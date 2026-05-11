import { createHmac, timingSafeEqual } from "node:crypto";

import { env } from "../../../lib/env";

const HUBSPOT_SIGNATURE_MAX_AGE_MS = 5 * 60 * 1000;

export type HubSpotWebhookEvent = Record<string, unknown>;

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

  console.info("Accepted HubSpot Webhook Batch", {
    eventCount: events.length,
  });

  return { events };
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
  const expectedSignature = createHmac("sha256", env.HUBSPOT_CLIENT_SECRET)
    .update(source, "utf8")
    .digest("base64");

  if (!constantTimeEqual(expectedSignature, signature)) {
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

function constantTimeEqual(expected: string, actual: string): boolean {
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return (
    expectedBuffer.byteLength === actualBuffer.byteLength &&
    timingSafeEqual(expectedBuffer, actualBuffer)
  );
}

function decodeHubSpotSignatureUri(uri: string): string {
  return uri.replace(/%(3A|2F|3F|40|21|24|27|28|29|2A|2C|3B)/gi, (match) =>
    decodeURIComponent(match),
  );
}
