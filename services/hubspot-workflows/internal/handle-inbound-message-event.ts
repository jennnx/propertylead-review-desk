import { z } from "zod";

import type { HubSpotClient } from "@/services/hubspot";

import {
  ENRICHMENT_INPUT_CONTACT_PROPERTY_NAMES,
  pickEnrichmentContactProperties,
} from "./enrichment-properties";
import {
  recordHubSpotWorkflowRunEnrichmentInputContext,
  type HubSpotWorkflowRunConversationMessage,
} from "./mutations";

const INBOUND_MESSAGE_TOTAL_LIMIT = 30;
const INBOUND_MESSAGE_PER_THREAD_FETCH_LIMIT = 30;

export type InboundMessageWorkflowEvent = {
  type: "conversation.message.received";
  hubSpotObjectId: string;
  hubSpotPortalId?: string | null;
  occurredAt?: string | null;
  hubSpotMessageId: string;
};

export type InboundMessageHubSpotClient = Pick<
  HubSpotClient,
  | "getContact"
  | "getConversationThread"
  | "listConversationThreads"
  | "getConversationThreadMessages"
>;

export async function handleInboundMessageWorkflowEvent({
  runId,
  workflowEvent,
  hubSpot,
}: {
  runId: string;
  workflowEvent: InboundMessageWorkflowEvent;
  hubSpot: InboundMessageHubSpotClient;
}): Promise<void> {
  const triggeringThread = await hubSpot.getConversationThread(
    workflowEvent.hubSpotObjectId,
  );

  if (!triggeringThread.associatedContactId) {
    throw new Error(
      `HubSpot Conversations thread ${triggeringThread.id} has no associated contact`,
    );
  }

  const contact = await hubSpot.getContact(
    triggeringThread.associatedContactId,
    {
      properties: [...ENRICHMENT_INPUT_CONTACT_PROPERTY_NAMES],
    },
  );

  const threadList = await hubSpot.listConversationThreads({
    associatedContactId: triggeringThread.associatedContactId,
  });

  const perThreadMessages = await Promise.all(
    threadList.results.map(async (listed) => {
      const messagesResponse = await hubSpot.getConversationThreadMessages(
        listed.id,
        { limit: INBOUND_MESSAGE_PER_THREAD_FETCH_LIMIT },
      );
      return messagesResponse.results.map((raw) =>
        normalizeInboundMessage(raw, listed.id),
      );
    }),
  );

  const messages = perThreadMessages
    .flat()
    .sort(byCreatedAtDescending)
    .slice(0, INBOUND_MESSAGE_TOTAL_LIMIT);

  await recordHubSpotWorkflowRunEnrichmentInputContext(runId, {
    source: "hubspot_inbound_message",
    hubSpotPortalId: workflowEvent.hubSpotPortalId ?? null,
    occurredAt: workflowEvent.occurredAt ?? null,
    triggeringMessageId: workflowEvent.hubSpotMessageId,
    contact: {
      id: contact.id,
      properties: pickEnrichmentContactProperties(contact.properties),
    },
    currentConversationSession: {
      messageLimit: INBOUND_MESSAGE_TOTAL_LIMIT,
      messages,
    },
  });
}

const nullableString = z
  .string()
  .nullish()
  .transform((value) => value ?? null)
  .catch(null);

const inboundMessageSchema = z
  .object({
    id: z.string(),
    createdAt: nullableString,
    direction: nullableString,
    text: nullableString,
    richText: nullableString,
    truncationStatus: nullableString,
    senders: z
      .array(z.object({ actorId: z.string() }).passthrough())
      .nullish()
      .catch(null),
  })
  .passthrough();

function normalizeInboundMessage(
  raw: unknown,
  threadId: string,
): HubSpotWorkflowRunConversationMessage {
  const parsed = inboundMessageSchema.parse(raw);
  const actorId = parsed.senders?.[0]?.actorId ?? null;
  return {
    id: parsed.id,
    threadId,
    actorId,
    direction: parsed.direction,
    text: parsed.text,
    richText: parsed.richText,
    createdAt: parsed.createdAt,
    truncationStatus: parsed.truncationStatus,
  };
}

function byCreatedAtDescending(
  a: HubSpotWorkflowRunConversationMessage,
  b: HubSpotWorkflowRunConversationMessage,
): number {
  const aKey = a.createdAt ?? "";
  const bKey = b.createdAt ?? "";
  if (aKey === bKey) return 0;
  return aKey < bKey ? 1 : -1;
}
