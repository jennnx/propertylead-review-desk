import { env } from "../../../lib/env";

export const HUBSPOT_WEBHOOK_ROUTE_PATH = "/api/hubspot/webhook" as const;

export function deriveHubSpotWebhookUrl(appBaseUrl: string): string {
  return new URL(HUBSPOT_WEBHOOK_ROUTE_PATH, appBaseUrl).toString();
}

export function getHubSpotWebhookUrl(): string {
  return deriveHubSpotWebhookUrl(env.APP_BASE_URL);
}
