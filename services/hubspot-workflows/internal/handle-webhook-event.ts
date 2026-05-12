import {
  markHubSpotWorkflowRunFailed,
  markHubSpotWorkflowRunSucceededWithNoWriteback,
  startHubSpotWorkflowRun,
} from "./mutations";

export type HandleHubSpotWebhookEventInput = {
  hubSpotWebhookEventId: string;
  normalizedEvent: unknown;
  rawWebhook: unknown;
};

export async function handleHubSpotWebhookEvent({
  hubSpotWebhookEventId,
  normalizedEvent,
  rawWebhook,
}: HandleHubSpotWebhookEventInput): Promise<void> {
  const run = await startHubSpotWorkflowRun(hubSpotWebhookEventId);

  try {
    assertSupportedHubSpotWorkflowEvent(normalizedEvent);

    console.info("Processing HubSpot Webhook Event", {
      normalizedEvent,
      rawWebhook,
    });

    await markHubSpotWorkflowRunSucceededWithNoWriteback(run.id, new Date());
  } catch (error) {
    await markHubSpotWorkflowRunFailed(
      run.id,
      getErrorMessage(error),
      new Date(),
    );
    throw error;
  }
}

function assertSupportedHubSpotWorkflowEvent(
  normalizedEvent: unknown,
): asserts normalizedEvent is {
  type: "contact.created" | "conversation.message.received";
} {
  if (
    typeof normalizedEvent === "object" &&
    normalizedEvent !== null &&
    "type" in normalizedEvent &&
    (normalizedEvent.type === "contact.created" ||
      normalizedEvent.type === "conversation.message.received")
  ) {
    return;
  }

  if (
    typeof normalizedEvent === "object" &&
    normalizedEvent !== null &&
    "type" in normalizedEvent &&
    typeof normalizedEvent.type === "string"
  ) {
    throw new Error(
      `Unsupported HubSpot Workflow Event: ${normalizedEvent.type}`,
    );
  }

  throw new Error("Unsupported HubSpot Workflow Event");
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Unknown HubSpot Workflow processing failure";
}
