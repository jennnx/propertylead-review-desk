import {
  HubSpotWebhookReceiptError,
  getHubSpotWebhookUrl,
  receiveHubSpotWebhookBatch,
} from "@/services/hubspot";

export async function POST(request: Request): Promise<Response> {
  try {
    const receipt = await receiveHubSpotWebhookBatch({
      method: request.method,
      webhookUrl: getHubSpotWebhookUrl(),
      rawBody: await request.text(),
      signature: request.headers.get("x-hubspot-signature-v3"),
      timestamp: request.headers.get("x-hubspot-request-timestamp"),
    });

    return Response.json({
      ok: true,
      acceptedEvents: receipt.events.length,
    });
  } catch (error) {
    if (error instanceof HubSpotWebhookReceiptError) {
      return Response.json(
        { ok: false, error: error.message },
        { status: error.reason === "unauthorized" ? 401 : 400 },
      );
    }

    throw error;
  }
}
