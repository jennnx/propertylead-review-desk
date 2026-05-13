import { z } from "zod";

import { recordProposedHubSpotWriteback } from "@/services/hubspot-writebacks";

import { handleContactCreatedWorkflowEvent } from "./handle-contact-created-event";
import { handleInboundMessageWorkflowEvent } from "./handle-inbound-message-event";
import {
  markHubSpotWorkflowRunFailed,
  markHubSpotWorkflowRunSucceededWithNoWriteback,
  markHubSpotWorkflowRunSucceededWithWritebackProposed,
  startHubSpotWorkflowRun,
} from "./mutations";
import type { HubSpotWritebackPlan } from "./writeback-plan";

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
    const workflowEvent = parseHubSpotWorkflowEvent(normalizedEvent);

    console.info("Processing HubSpot Webhook Event", {
      normalizedEvent: workflowEvent,
      rawWebhook,
    });

    let acceptedPlan: HubSpotWritebackPlan | null = null;
    if (workflowEvent.type === "contact.created") {
      const result = await handleContactCreatedWorkflowEvent({
        runId: run.id,
        workflowEvent,
      });
      acceptedPlan = result.plan;
    } else if (workflowEvent.type === "conversation.message.received") {
      const result = await handleInboundMessageWorkflowEvent({
        runId: run.id,
        workflowEvent,
      });
      acceptedPlan = result.plan;
    }

    if (acceptedPlan?.kind === "writeback") {
      await markHubSpotWorkflowRunSucceededWithWritebackProposed(
        run.id,
        new Date(),
      );
      await recordProposedHubSpotWriteback({
        hubSpotWorkflowRunId: run.id,
        plan: acceptedPlan,
      });
    } else {
      await markHubSpotWorkflowRunSucceededWithNoWriteback(run.id, new Date());
    }
  } catch (error) {
    await markHubSpotWorkflowRunFailed(
      run.id,
      getErrorMessage(error),
      new Date(),
    );
    throw error;
  }
}

const hubSpotWorkflowEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("contact.created"),
    hubSpotObjectId: z.string().min(1),
    hubSpotPortalId: z.string().nullable().optional(),
    occurredAt: z.string().nullable().optional(),
  }),
  z.object({
    type: z.literal("conversation.message.received"),
    hubSpotObjectId: z.string().min(1),
    hubSpotPortalId: z.string().nullable().optional(),
    occurredAt: z.string().nullable().optional(),
    hubSpotMessageId: z.string().min(1),
  }),
]);

type HubSpotWorkflowEvent = z.infer<typeof hubSpotWorkflowEventSchema>;

function parseHubSpotWorkflowEvent(
  normalizedEvent: unknown,
): HubSpotWorkflowEvent {
  const result = hubSpotWorkflowEventSchema.safeParse(normalizedEvent);
  if (result.success) {
    return result.data;
  }

  throw new Error(getUnsupportedWorkflowEventMessage(normalizedEvent));
}

function getUnsupportedWorkflowEventMessage(normalizedEvent: unknown): string {
  const eventType = z
    .object({
      type: z.string().min(1),
    })
    .passthrough()
    .safeParse(normalizedEvent);

  if (eventType.success) {
    return `Unsupported HubSpot Workflow Event: ${eventType.data.type}`;
  }

  return "Unsupported HubSpot Workflow Event";
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Unknown HubSpot Workflow processing failure";
}
