import { createHash } from "node:crypto";

export function createHubSpotWebhookEventDedupeKey(
  rawWebhook: Record<string, unknown>,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        eventId: readStringish(rawWebhook.eventId),
        messageId: readStringish(rawWebhook.messageId),
        messageType: readStringish(rawWebhook.messageType),
        objectId: readStringish(rawWebhook.objectId),
        objectTypeId: readStringish(rawWebhook.objectTypeId),
        occurredAt: readStringish(rawWebhook.occurredAt),
        portalId: readStringish(rawWebhook.portalId),
        subscriptionId: readStringish(rawWebhook.subscriptionId),
        subscriptionType: readStringish(rawWebhook.subscriptionType),
      }),
    )
    .digest("hex");
}

export function normalizeHubSpotOccurredAt(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date.toISOString();
}

export function readStringish(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return value.toString();
  }

  return null;
}
