export type HandleHubSpotWebhookEventInput = {
  normalizedEvent: unknown;
  rawWebhook: unknown;
};

export async function handleHubSpotWebhookEvent({
  normalizedEvent,
  rawWebhook,
}: HandleHubSpotWebhookEventInput): Promise<void> {
  console.info("Processing HubSpot Webhook Event", {
    normalizedEvent,
    rawWebhook,
  });
}
