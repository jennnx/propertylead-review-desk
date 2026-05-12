import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type {
  HubSpotClient,
  HubSpotContact,
  HubSpotConversationThread,
  HubSpotConversationThreadList,
  HubSpotConversationThreadMessages,
} from "@/services/hubspot";
import { importWithRequiredEnv } from "@/tests/env";

const upsert = vi.fn();
const update = vi.fn();

vi.mock("@/services/database", () => ({
  getPrismaClient: () => ({
    hubSpotWorkflowRun: {
      upsert,
      update,
    },
  }),
}));

describe("HubSpot workflows service", () => {
  beforeEach(() => {
    upsert.mockReset();
    update.mockReset();
  });

  test("records a successful HubSpot Workflow Run for a target HubSpot Webhook Event", async () => {
    upsert.mockResolvedValue({ id: "workflow-run-1" });
    update.mockResolvedValue({});
    const hubSpot = stubInboundMessageHubSpot();
    const { handleHubSpotWebhookEvent } = await importWithRequiredEnv(() =>
      import("./index"),
    );

    await handleHubSpotWebhookEvent({
      hubSpotWebhookEventId: "hubspot-event-1",
      normalizedEvent: {
        type: "conversation.message.received",
        hubSpotObjectId: "123",
        hubSpotMessageId: "message-123",
      },
      rawWebhook: {
        eventId: 1001,
      },
      hubSpot,
    });

    expect(upsert).toHaveBeenCalledWith({
      where: {
        hubSpotWebhookEventId: "hubspot-event-1",
      },
      create: {
        hubSpotWebhookEventId: "hubspot-event-1",
        status: "IN_PROGRESS",
      },
      update: {
        status: "IN_PROGRESS",
        outcome: null,
        enrichmentInputContext: Prisma.DbNull,
        failureMessage: null,
        completedAt: null,
      },
      select: {
        id: true,
      },
    });
    expect(update).toHaveBeenCalledWith({
      where: {
        id: "workflow-run-1",
      },
      data: {
        status: "SUCCEEDED",
        outcome: "NO_WRITEBACK_NEEDED",
        completedAt: expect.any(Date),
      },
    });
  });

  test("fetches the triggering HubSpot Conversations thread for an inbound-message event", async () => {
    upsert.mockResolvedValue({ id: "workflow-run-1" });
    update.mockResolvedValue({});
    const hubSpot = stubInboundMessageHubSpot({
      thread: { id: "thread-1", associatedContactId: "contact-1" },
    });
    const { handleHubSpotWebhookEvent } = await importWithRequiredEnv(() =>
      import("./index"),
    );

    await handleHubSpotWebhookEvent({
      hubSpotWebhookEventId: "hubspot-event-1",
      normalizedEvent: {
        type: "conversation.message.received",
        hubSpotObjectId: "thread-1",
        hubSpotMessageId: "message-123",
      },
      rawWebhook: {
        eventId: 1001,
      },
      hubSpot,
    });

    expect(hubSpot.getConversationThread).toHaveBeenCalledWith("thread-1");
  });

  test("fetches the HubSpot contact associated with the triggering thread for an inbound-message event", async () => {
    upsert.mockResolvedValue({ id: "workflow-run-1" });
    update.mockResolvedValue({});
    const hubSpot = stubInboundMessageHubSpot({
      thread: { id: "thread-1", associatedContactId: "contact-7" },
      contact: {
        id: "contact-7",
        properties: { email: "ada@example.com" },
      },
    });
    const { handleHubSpotWebhookEvent } = await importWithRequiredEnv(() =>
      import("./index"),
    );

    await handleHubSpotWebhookEvent({
      hubSpotWebhookEventId: "hubspot-event-1",
      normalizedEvent: {
        type: "conversation.message.received",
        hubSpotObjectId: "thread-1",
        hubSpotMessageId: "message-123",
      },
      rawWebhook: {
        eventId: 1001,
      },
      hubSpot,
    });

    expect(hubSpot.getContact).toHaveBeenCalledWith("contact-7", {
      properties: expect.arrayContaining([
        "email",
        "firstname",
        "pd_urgency",
        "pd_primary_intent",
        "hs_analytics_source_data_1",
      ]),
    });
  });

  test("lists all HubSpot Conversations threads for the inbound-message contact", async () => {
    upsert.mockResolvedValue({ id: "workflow-run-1" });
    update.mockResolvedValue({});
    const hubSpot = stubInboundMessageHubSpot({
      thread: { id: "thread-1", associatedContactId: "contact-7" },
    });
    const { handleHubSpotWebhookEvent } = await importWithRequiredEnv(() =>
      import("./index"),
    );

    await handleHubSpotWebhookEvent({
      hubSpotWebhookEventId: "hubspot-event-1",
      normalizedEvent: {
        type: "conversation.message.received",
        hubSpotObjectId: "thread-1",
        hubSpotMessageId: "message-123",
      },
      rawWebhook: {
        eventId: 1001,
      },
      hubSpot,
    });

    expect(hubSpot.listConversationThreads).toHaveBeenCalledWith({
      associatedContactId: "contact-7",
    });
  });

  test("fetches the latest 30 messages from each of the contact's HubSpot Conversations threads", async () => {
    upsert.mockResolvedValue({ id: "workflow-run-1" });
    update.mockResolvedValue({});
    const hubSpot = stubInboundMessageHubSpot({
      thread: { id: "thread-1", associatedContactId: "contact-7" },
      threadList: [
        { id: "thread-1", associatedContactId: "contact-7" },
        { id: "thread-2", associatedContactId: "contact-7" },
      ],
    });
    const { handleHubSpotWebhookEvent } = await importWithRequiredEnv(() =>
      import("./index"),
    );

    await handleHubSpotWebhookEvent({
      hubSpotWebhookEventId: "hubspot-event-1",
      normalizedEvent: {
        type: "conversation.message.received",
        hubSpotObjectId: "thread-1",
        hubSpotMessageId: "message-123",
      },
      rawWebhook: {
        eventId: 1001,
      },
      hubSpot,
    });

    expect(hubSpot.getConversationThreadMessages).toHaveBeenCalledWith(
      "thread-1",
      { limit: 30 },
    );
    expect(hubSpot.getConversationThreadMessages).toHaveBeenCalledWith(
      "thread-2",
      { limit: 30 },
    );
  });

  test("captures inbound-message Enrichment Input Context with contact and aggregated conversation session", async () => {
    upsert.mockResolvedValue({ id: "workflow-run-1" });
    update.mockResolvedValue({});
    const hubSpot = stubInboundMessageHubSpot({
      thread: { id: "thread-1", associatedContactId: "contact-7" },
      contact: {
        id: "contact-7",
        properties: {
          email: "ada@example.com",
          pd_urgency: "high",
        },
      },
      threadList: [
        { id: "thread-1", associatedContactId: "contact-7" },
        { id: "thread-2", associatedContactId: "contact-7" },
      ],
      threadMessages: {
        "thread-1": {
          results: [
            { id: "msg-a", createdAt: "2026-05-12T10:00:00.000Z" },
            { id: "msg-c", createdAt: "2026-05-12T12:00:00.000Z" },
          ],
        },
        "thread-2": {
          results: [
            { id: "msg-b", createdAt: "2026-05-12T11:00:00.000Z" },
          ],
        },
      },
    });
    const { handleHubSpotWebhookEvent } = await importWithRequiredEnv(() =>
      import("./index"),
    );

    await handleHubSpotWebhookEvent({
      hubSpotWebhookEventId: "hubspot-event-1",
      normalizedEvent: {
        type: "conversation.message.received",
        hubSpotObjectId: "thread-1",
        hubSpotMessageId: "msg-c",
        hubSpotPortalId: "portal-1",
        occurredAt: "2026-05-12T12:00:00.000Z",
      },
      rawWebhook: {
        eventId: 1001,
      },
      hubSpot,
    });

    const firstUpdateCall = update.mock.calls[0]?.[0];
    expect(firstUpdateCall).toMatchObject({
      where: { id: "workflow-run-1" },
      data: {
        enrichmentInputContext: expect.objectContaining({
          source: "hubspot_inbound_message",
          hubSpotPortalId: "portal-1",
          occurredAt: "2026-05-12T12:00:00.000Z",
          triggeringMessageId: "msg-c",
          contact: expect.objectContaining({
            id: "contact-7",
            properties: expect.objectContaining({
              email: "ada@example.com",
              pd_urgency: "high",
            }),
          }),
          currentConversationSession: expect.objectContaining({
            messageLimit: 30,
            messages: [
              expect.objectContaining({
                id: "msg-c",
                createdAt: "2026-05-12T12:00:00.000Z",
              }),
              expect.objectContaining({
                id: "msg-b",
                createdAt: "2026-05-12T11:00:00.000Z",
              }),
              expect.objectContaining({
                id: "msg-a",
                createdAt: "2026-05-12T10:00:00.000Z",
              }),
            ],
          }),
        }),
      },
    });
  });

  test("preserves HubSpot message metadata and truncation status in current conversation session", async () => {
    upsert.mockResolvedValue({ id: "workflow-run-1" });
    update.mockResolvedValue({});
    const hubSpot = stubInboundMessageHubSpot({
      thread: { id: "thread-1", associatedContactId: "contact-7" },
      threadList: [{ id: "thread-1", associatedContactId: "contact-7" }],
      threadMessages: {
        "thread-1": {
          results: [
            {
              id: "msg-1",
              createdAt: "2026-05-12T12:00:00.000Z",
              direction: "INCOMING",
              text: "Hi there",
              richText: "<p>Hi there</p>",
              truncationStatus: "TRUNCATED",
              senders: [{ actorId: "V-123" }],
            },
            {
              id: "msg-2",
              createdAt: "2026-05-12T11:00:00.000Z",
              direction: "OUTGOING",
              text: "Hello!",
              richText: null,
              truncationStatus: "NOT_TRUNCATED",
              senders: [{ actorId: "A-456" }],
            },
          ],
        },
      },
    });
    const { handleHubSpotWebhookEvent } = await importWithRequiredEnv(() =>
      import("./index"),
    );

    await handleHubSpotWebhookEvent({
      hubSpotWebhookEventId: "hubspot-event-1",
      normalizedEvent: {
        type: "conversation.message.received",
        hubSpotObjectId: "thread-1",
        hubSpotMessageId: "msg-1",
      },
      rawWebhook: {
        eventId: 1001,
      },
      hubSpot,
    });

    const firstUpdateCall = update.mock.calls[0]?.[0];
    const sessionMessages =
      firstUpdateCall.data.enrichmentInputContext.currentConversationSession
        .messages;
    expect(sessionMessages).toEqual([
      {
        id: "msg-1",
        threadId: "thread-1",
        actorId: "V-123",
        direction: "INCOMING",
        text: "Hi there",
        richText: "<p>Hi there</p>",
        createdAt: "2026-05-12T12:00:00.000Z",
        truncationStatus: "TRUNCATED",
      },
      {
        id: "msg-2",
        threadId: "thread-1",
        actorId: "A-456",
        direction: "OUTGOING",
        text: "Hello!",
        richText: null,
        createdAt: "2026-05-12T11:00:00.000Z",
        truncationStatus: "NOT_TRUNCATED",
      },
    ]);
  });

  test("fails the HubSpot Workflow Run when the triggering thread has no associated contact", async () => {
    upsert.mockResolvedValue({ id: "workflow-run-1" });
    update.mockResolvedValue({});
    const hubSpot = stubInboundMessageHubSpot({
      thread: { id: "thread-1", associatedContactId: null },
    });
    const { handleHubSpotWebhookEvent } = await importWithRequiredEnv(() =>
      import("./index"),
    );

    await expect(
      handleHubSpotWebhookEvent({
        hubSpotWebhookEventId: "hubspot-event-1",
        normalizedEvent: {
          type: "conversation.message.received",
          hubSpotObjectId: "thread-1",
          hubSpotMessageId: "message-123",
        },
        rawWebhook: { eventId: 1001 },
        hubSpot,
      }),
    ).rejects.toThrow(/no associated contact/);

    expect(hubSpot.getContact).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({
      where: { id: "workflow-run-1" },
      data: {
        status: "FAILED",
        outcome: null,
        failureMessage: expect.stringMatching(/no associated contact/),
        completedAt: expect.any(Date),
      },
    });
  });

  test("captures an empty current conversation session when the contact has no threads", async () => {
    upsert.mockResolvedValue({ id: "workflow-run-1" });
    update.mockResolvedValue({});
    const hubSpot = stubInboundMessageHubSpot({
      thread: { id: "thread-1", associatedContactId: "contact-7" },
      threadList: [],
    });
    const { handleHubSpotWebhookEvent } = await importWithRequiredEnv(() =>
      import("./index"),
    );

    await handleHubSpotWebhookEvent({
      hubSpotWebhookEventId: "hubspot-event-1",
      normalizedEvent: {
        type: "conversation.message.received",
        hubSpotObjectId: "thread-1",
        hubSpotMessageId: "message-123",
      },
      rawWebhook: { eventId: 1001 },
      hubSpot,
    });

    expect(hubSpot.getConversationThreadMessages).not.toHaveBeenCalled();
    const firstUpdateCall = update.mock.calls[0]?.[0];
    expect(
      firstUpdateCall.data.enrichmentInputContext.currentConversationSession,
    ).toEqual({ messageLimit: 30, messages: [] });
  });

  test("captures contact-created Enrichment Input Context from current HubSpot contact truth", async () => {
    upsert.mockResolvedValue({ id: "workflow-run-1" });
    update.mockResolvedValue({});
    const hubSpot = stubInboundMessageHubSpot({
      contact: {
        id: "123",
        properties: {
          email: "ada@example.com",
          firstname: "Ada",
          pd_urgency: "high",
          pd_primary_intent: null,
          hs_analytics_source_data_1: "Zillow",
        },
      },
    });
    const { handleHubSpotWebhookEvent } = await importWithRequiredEnv(() =>
      import("./index"),
    );

    await handleHubSpotWebhookEvent({
      hubSpotWebhookEventId: "hubspot-event-1",
      normalizedEvent: {
        type: "contact.created",
        hubSpotObjectId: "123",
        hubSpotPortalId: "456",
        occurredAt: "2026-05-12T15:00:00.000Z",
      },
      rawWebhook: {
        eventId: 1001,
      },
      hubSpot,
    });

    expect(hubSpot.getConversationThread).not.toHaveBeenCalled();
    expect(hubSpot.listConversationThreads).not.toHaveBeenCalled();
    expect(hubSpot.getConversationThreadMessages).not.toHaveBeenCalled();
    expect(hubSpot.getContact).toHaveBeenCalledWith("123", {
      properties: expect.arrayContaining([
        "email",
        "firstname",
        "pd_urgency",
        "pd_primary_intent",
        "hs_analytics_source_data_1",
      ]),
    });
    expect(update).toHaveBeenCalledWith({
      where: {
        id: "workflow-run-1",
      },
      data: {
        enrichmentInputContext: expect.objectContaining({
          source: "hubspot_contact_created",
          hubSpotPortalId: "456",
          occurredAt: "2026-05-12T15:00:00.000Z",
          contact: expect.objectContaining({
            id: "123",
            properties: expect.objectContaining({
              email: "ada@example.com",
              firstname: "Ada",
              pd_urgency: "high",
              pd_primary_intent: null,
              hs_analytics_source_data_1: "Zillow",
              lastname: null,
              phone: null,
              pd_transaction_side: null,
              hs_latest_source_data_1: null,
            }),
          }),
        }),
      },
    });
  });

  test("stores contact-created Enrichment Input Context as bounded operational trace, not current contact state", async () => {
    upsert.mockResolvedValue({ id: "workflow-run-1" });
    update.mockResolvedValue({});
    const hubSpot = stubInboundMessageHubSpot({
      contact: {
        id: "123",
        properties: {
          email: "ada@example.com",
          pd_urgency: "high",
          hubspot_owner_id: "owner-1",
          lifecycle_stage: "lead",
          made_up_by_portal: "should not be stored",
        },
      },
    });
    const { handleHubSpotWebhookEvent } = await importWithRequiredEnv(() =>
      import("./index"),
    );

    await handleHubSpotWebhookEvent({
      hubSpotWebhookEventId: "hubspot-event-1",
      normalizedEvent: {
        type: "contact.created",
        hubSpotObjectId: "123",
      },
      rawWebhook: {
        eventId: 1001,
      },
      hubSpot,
    });

    expect(hubSpot.getConversationThread).not.toHaveBeenCalled();
    expect(hubSpot.listConversationThreads).not.toHaveBeenCalled();
    expect(hubSpot.getConversationThreadMessages).not.toHaveBeenCalled();
    const firstUpdateCall = update.mock.calls[0]?.[0];
    expect(firstUpdateCall).toMatchObject({
      where: { id: "workflow-run-1" },
      data: {
        enrichmentInputContext: {
          source: "hubspot_contact_created",
          hubSpotPortalId: null,
          occurredAt: null,
          contact: {
            id: "123",
            properties: {
              email: "ada@example.com",
              pd_urgency: "high",
            },
          },
        },
      },
    });

    const storedProperties =
      firstUpdateCall.data.enrichmentInputContext.contact.properties;
    expect(storedProperties).not.toHaveProperty("hubspot_owner_id");
    expect(storedProperties).not.toHaveProperty("lifecycle_stage");
    expect(storedProperties).not.toHaveProperty("made_up_by_portal");
  });

  test("marks the HubSpot Workflow Run failed when workflow processing fails", async () => {
    upsert.mockResolvedValue({ id: "workflow-run-1" });
    update.mockResolvedValue({});
    const { handleHubSpotWebhookEvent } = await importWithRequiredEnv(() =>
      import("./index"),
    );

    await expect(
      handleHubSpotWebhookEvent({
        hubSpotWebhookEventId: "hubspot-event-1",
        normalizedEvent: {
          type: "unsupported.event",
          hubSpotObjectId: "123",
        },
        rawWebhook: {
          eventId: 1001,
        },
      }),
    ).rejects.toThrow("Unsupported HubSpot Workflow Event");

    expect(update).toHaveBeenCalledWith({
      where: {
        id: "workflow-run-1",
      },
      data: {
        status: "FAILED",
        outcome: null,
        failureMessage: "Unsupported HubSpot Workflow Event: unsupported.event",
        completedAt: expect.any(Date),
      },
    });
  });
});

type HubSpotWorkflowStub = Pick<
  HubSpotClient,
  | "getContact"
  | "getConversationThread"
  | "listConversationThreads"
  | "getConversationThreadMessages"
>;

function stubInboundMessageHubSpot(overrides: {
  thread?: HubSpotConversationThread;
  contact?: HubSpotContact;
  threadList?: HubSpotConversationThread[];
  threadMessages?: Record<string, HubSpotConversationThreadMessages>;
} = {}): HubSpotWorkflowStub {
  const thread: HubSpotConversationThread =
    overrides.thread ?? { id: "thread-1", associatedContactId: "contact-1" };
  const contact: HubSpotContact =
    overrides.contact ?? {
      id: thread.associatedContactId ?? "contact-1",
      properties: {},
    };
  const threadList: HubSpotConversationThread[] =
    overrides.threadList ?? [thread];
  const threadMessages = overrides.threadMessages ?? {};

  const getConversationThread = vi.fn<HubSpotClient["getConversationThread"]>(
    async () => thread,
  );
  const getContact = vi.fn<HubSpotClient["getContact"]>(async () => contact);
  const listConversationThreads = vi.fn<
    HubSpotClient["listConversationThreads"]
  >(async (): Promise<HubSpotConversationThreadList> => ({
    results: threadList,
  }));
  const getConversationThreadMessages = vi.fn<
    HubSpotClient["getConversationThreadMessages"]
  >(async (threadId): Promise<HubSpotConversationThreadMessages> =>
    threadMessages[threadId] ?? { results: [] },
  );

  return {
    getConversationThread,
    getContact,
    listConversationThreads,
    getConversationThreadMessages,
  };
}
