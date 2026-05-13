import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type {
  HubSpotContact,
  HubSpotConversationThread,
  HubSpotConversationThreadMessages,
} from "@/services/hubspot";
import { importWithRequiredEnv } from "@/tests/env";

const upsert = vi.fn();
const update = vi.fn();
const messagesCreate = vi.fn();

const getContact = vi.fn();
const getConversationThread = vi.fn();
const listConversationThreads = vi.fn();
const getConversationThreadMessages = vi.fn();

vi.mock("@/services/database", () => ({
  getPrismaClient: () => ({
    hubSpotWorkflowRun: {
      upsert,
      update,
    },
  }),
}));

vi.mock("@/services/claude", () => ({
  claude: {
    messages: {
      create: messagesCreate,
    },
  },
  CLAUDE_MODELS: {
    OPUS: "claude-opus-4-7",
    SONNET: "claude-sonnet-4-6",
    HAIKU: "claude-haiku-4-5-20251001",
  },
  DEFAULT_CLAUDE_MODEL: "claude-sonnet-4-6",
}));

vi.mock("@/services/hubspot", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/services/hubspot")>();
  return {
    ...actual,
    hubSpot: {
      getContact,
      getConversationThread,
      listConversationThreads,
      getConversationThreadMessages,
    },
  };
});

function claudeWritebackPlanResponse(input: unknown) {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-4-6",
    content: [
      {
        type: "tool_use",
        id: "toolu_test",
        name: "propose_writeback_plan",
        input,
      },
    ],
    stop_reason: "tool_use",
  };
}

function configureInboundMessageHubSpot(overrides: {
  thread?: HubSpotConversationThread;
  contact?: HubSpotContact;
  threadList?: HubSpotConversationThread[];
  threadMessages?: Record<string, HubSpotConversationThreadMessages>;
} = {}) {
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

  getConversationThread.mockResolvedValue(thread);
  getContact.mockResolvedValue(contact);
  listConversationThreads.mockResolvedValue({ results: threadList });
  getConversationThreadMessages.mockImplementation(
    async (threadId: string) =>
      threadMessages[threadId] ?? { results: [] },
  );
}

describe("HubSpot workflows service", () => {
  beforeEach(() => {
    upsert.mockReset();
    update.mockReset();
    messagesCreate.mockReset();
    getContact.mockReset();
    getConversationThread.mockReset();
    listConversationThreads.mockReset();
    getConversationThreadMessages.mockReset();
    messagesCreate.mockResolvedValue(
      claudeWritebackPlanResponse({
        kind: "no_writeback",
        reason: "No actionable signal in new contact yet.",
      }),
    );
  });

  test("records a successful HubSpot Workflow Run for a target HubSpot Webhook Event", async () => {
    upsert.mockResolvedValue({ id: "workflow-run-1" });
    update.mockResolvedValue({});
    configureInboundMessageHubSpot();
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
    configureInboundMessageHubSpot({
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
    });

    expect(getConversationThread).toHaveBeenCalledWith("thread-1");
  });

  test("fetches the HubSpot contact associated with the triggering thread for an inbound-message event", async () => {
    upsert.mockResolvedValue({ id: "workflow-run-1" });
    update.mockResolvedValue({});
    configureInboundMessageHubSpot({
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
    });

    expect(getContact).toHaveBeenCalledWith("contact-7", {
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
    configureInboundMessageHubSpot({
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
    });

    expect(listConversationThreads).toHaveBeenCalledWith({
      associatedContactId: "contact-7",
    });
  });

  test("fetches the latest 30 messages from each of the contact's HubSpot Conversations threads", async () => {
    upsert.mockResolvedValue({ id: "workflow-run-1" });
    update.mockResolvedValue({});
    configureInboundMessageHubSpot({
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
    });

    expect(getConversationThreadMessages).toHaveBeenCalledWith(
      "thread-1",
      { limit: 30 },
    );
    expect(getConversationThreadMessages).toHaveBeenCalledWith(
      "thread-2",
      { limit: 30 },
    );
  });

  test("captures inbound-message Enrichment Input Context with contact and aggregated conversation session", async () => {
    upsert.mockResolvedValue({ id: "workflow-run-1" });
    update.mockResolvedValue({});
    configureInboundMessageHubSpot({
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
    configureInboundMessageHubSpot({
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
    configureInboundMessageHubSpot({
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
      }),
    ).rejects.toThrow(/no associated contact/);

    expect(getContact).not.toHaveBeenCalled();
    expect(messagesCreate).not.toHaveBeenCalled();
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
    configureInboundMessageHubSpot({
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
    });

    expect(getConversationThreadMessages).not.toHaveBeenCalled();
    const firstUpdateCall = update.mock.calls[0]?.[0];
    expect(
      firstUpdateCall.data.enrichmentInputContext.currentConversationSession,
    ).toEqual({ messageLimit: 30, messages: [] });
  });

  test("captures contact-created Enrichment Input Context from current HubSpot contact truth", async () => {
    upsert.mockResolvedValue({ id: "workflow-run-1" });
    update.mockResolvedValue({});
    configureInboundMessageHubSpot({
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
    });

    expect(getConversationThread).not.toHaveBeenCalled();
    expect(listConversationThreads).not.toHaveBeenCalled();
    expect(getConversationThreadMessages).not.toHaveBeenCalled();
    expect(getContact).toHaveBeenCalledWith("123", {
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
    configureInboundMessageHubSpot({
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
    });

    expect(getConversationThread).not.toHaveBeenCalled();
    expect(listConversationThreads).not.toHaveBeenCalled();
    expect(getConversationThreadMessages).not.toHaveBeenCalled();
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

  test("requests a HubSpot Writeback Plan from Claude and stores the accepted plan plus AI trace for contact.created runs", async () => {
    upsert.mockResolvedValue({ id: "workflow-run-1" });
    update.mockResolvedValue({});
    messagesCreate.mockResolvedValue(
      claudeWritebackPlanResponse({
        kind: "no_writeback",
        reason: "New contact arrived without enrichable signal yet.",
      }),
    );
    configureInboundMessageHubSpot({
      contact: {
        id: "123",
        properties: { email: "ada@example.com" },
      },
    });
    const { handleHubSpotWebhookEvent } = await importWithRequiredEnv(() =>
      import("./index"),
    );

    await handleHubSpotWebhookEvent({
      hubSpotWebhookEventId: "hubspot-event-1",
      normalizedEvent: { type: "contact.created", hubSpotObjectId: "123" },
      rawWebhook: { eventId: 1001 },
    });

    expect(messagesCreate).toHaveBeenCalledTimes(1);

    const writebackUpdate = update.mock.calls
      .map((call) => call[0])
      .find((arg) => arg?.data?.writebackPlan !== undefined);

    expect(writebackUpdate).toMatchObject({
      where: { id: "workflow-run-1" },
      data: {
        writebackPlan: {
          kind: "no_writeback",
          reason: "New contact arrived without enrichable signal yet.",
        },
        writebackPlanInput: expect.any(Object),
        writebackPlanRawOutputs: expect.any(Array),
        writebackPlanValidations: expect.any(Array),
      },
    });
    expect(
      (writebackUpdate?.data?.writebackPlanRawOutputs as unknown[]).length,
    ).toBe(1);
    expect(writebackUpdate?.data?.writebackPlanValidations).toEqual([
      { ok: true },
    ]);

    expect(update).toHaveBeenCalledWith({
      where: { id: "workflow-run-1" },
      data: {
        status: "SUCCEEDED",
        outcome: "NO_WRITEBACK_NEEDED",
        completedAt: expect.any(Date),
      },
    });
  });

  test("retries Claude once when the first writeback plan is invalid and accepts the second valid plan", async () => {
    upsert.mockResolvedValue({ id: "workflow-run-1" });
    update.mockResolvedValue({});
    messagesCreate
      .mockResolvedValueOnce(
        claudeWritebackPlanResponse({
          kind: "writeback",
          fieldUpdates: [
            { name: "made_up_by_claude", value: "something" },
          ],
        }),
      )
      .mockResolvedValueOnce(
        claudeWritebackPlanResponse({
          kind: "writeback",
          fieldUpdates: [{ name: "pd_urgency", value: "high" }],
          note: "Hot lead from Zillow.",
        }),
      );
    configureInboundMessageHubSpot({
      contact: { id: "123", properties: { email: "ada@example.com" } },
    });
    const { handleHubSpotWebhookEvent } = await importWithRequiredEnv(() =>
      import("./index"),
    );

    await handleHubSpotWebhookEvent({
      hubSpotWebhookEventId: "hubspot-event-1",
      normalizedEvent: { type: "contact.created", hubSpotObjectId: "123" },
      rawWebhook: { eventId: 1001 },
    });

    expect(messagesCreate).toHaveBeenCalledTimes(2);

    const writebackUpdate = update.mock.calls
      .map((call) => call[0])
      .find((arg) => arg?.data?.writebackPlan !== undefined);
    expect(writebackUpdate?.data?.writebackPlan).toEqual({
      kind: "writeback",
      fieldUpdates: [{ name: "pd_urgency", value: "high" }],
      note: "Hot lead from Zillow.",
    });
    expect(writebackUpdate?.data?.writebackPlanValidations).toEqual([
      { ok: false, errors: expect.any(Array) },
      { ok: true },
    ]);
    expect(
      (writebackUpdate?.data?.writebackPlanRawOutputs as unknown[]).length,
    ).toBe(2);
    expect(update).toHaveBeenCalledWith({
      where: { id: "workflow-run-1" },
      data: {
        status: "SUCCEEDED",
        outcome: "WRITEBACK_PROPOSED",
        completedAt: expect.any(Date),
      },
    });
  });

  test("fails the HubSpot Workflow Run when both Claude attempts produce invalid plans, preserving the trace", async () => {
    upsert.mockResolvedValue({ id: "workflow-run-1" });
    update.mockResolvedValue({});
    messagesCreate
      .mockResolvedValueOnce(
        claudeWritebackPlanResponse({
          kind: "writeback",
          fieldUpdates: [{ name: "made_up_one", value: "x" }],
        }),
      )
      .mockResolvedValueOnce(
        claudeWritebackPlanResponse({
          kind: "writeback",
          fieldUpdates: [{ name: "made_up_two", value: "y" }],
        }),
      );
    configureInboundMessageHubSpot({
      contact: { id: "123", properties: { email: "ada@example.com" } },
    });
    const { handleHubSpotWebhookEvent } = await importWithRequiredEnv(() =>
      import("./index"),
    );

    await expect(
      handleHubSpotWebhookEvent({
        hubSpotWebhookEventId: "hubspot-event-1",
        normalizedEvent: { type: "contact.created", hubSpotObjectId: "123" },
        rawWebhook: { eventId: 1001 },
      }),
    ).rejects.toThrow(/valid HubSpot Writeback Plan/);

    expect(messagesCreate).toHaveBeenCalledTimes(2);

    const writebackUpdate = update.mock.calls
      .map((call) => call[0])
      .find((arg) => arg?.data?.writebackPlanInput !== undefined);
    expect(writebackUpdate).toBeDefined();
    expect(writebackUpdate?.data?.writebackPlan).toBe(Prisma.DbNull);
    expect(
      (writebackUpdate?.data?.writebackPlanValidations as unknown[]).every(
        (v) => (v as { ok?: boolean }).ok === false,
      ),
    ).toBe(true);

    expect(update).toHaveBeenCalledWith({
      where: { id: "workflow-run-1" },
      data: {
        status: "FAILED",
        outcome: null,
        failureMessage: expect.stringMatching(/valid HubSpot Writeback Plan/),
        completedAt: expect.any(Date),
      },
    });
  });

  test("preserves prompt input and a transport-error trace entry when Claude throws", async () => {
    upsert.mockResolvedValue({ id: "workflow-run-1" });
    update.mockResolvedValue({});
    messagesCreate
      .mockRejectedValueOnce(new Error("connect ECONNRESET"))
      .mockRejectedValueOnce(new Error("connect ECONNRESET"));
    configureInboundMessageHubSpot({
      contact: { id: "123", properties: { email: "ada@example.com" } },
    });
    const { handleHubSpotWebhookEvent } = await importWithRequiredEnv(() =>
      import("./index"),
    );

    await expect(
      handleHubSpotWebhookEvent({
        hubSpotWebhookEventId: "hubspot-event-1",
        normalizedEvent: { type: "contact.created", hubSpotObjectId: "123" },
        rawWebhook: { eventId: 1001 },
      }),
    ).rejects.toThrow(/valid HubSpot Writeback Plan/);

    expect(messagesCreate).toHaveBeenCalledTimes(2);

    const writebackUpdate = update.mock.calls
      .map((call) => call[0])
      .find((arg) => arg?.data?.writebackPlanInput !== undefined);
    expect(writebackUpdate?.data?.writebackPlanInput).toBeDefined();
    expect(
      (writebackUpdate?.data?.writebackPlanRawOutputs as unknown[]).length,
    ).toBe(2);
    const validations =
      writebackUpdate?.data?.writebackPlanValidations as unknown[];
    expect(
      validations.every((v) => (v as { ok?: boolean }).ok === false),
    ).toBe(true);
    expect(
      validations.every((v) =>
        ((v as { errors?: string[] }).errors ?? []).some((msg) =>
          /transport error/i.test(msg),
        ),
      ),
    ).toBe(true);
  });

  test("requests a HubSpot Writeback Plan from Claude and stores the accepted plan plus AI trace for conversation.message.received runs", async () => {
    upsert.mockResolvedValue({ id: "workflow-run-1" });
    update.mockResolvedValue({});
    messagesCreate.mockResolvedValue(
      claudeWritebackPlanResponse({
        kind: "writeback",
        fieldUpdates: [{ name: "pd_urgency", value: "high" }],
        note: "Suggested reply: thanks for reaching out — happy to set up a viewing this weekend.",
      }),
    );
    configureInboundMessageHubSpot({
      thread: { id: "thread-1", associatedContactId: "contact-7" },
      contact: { id: "contact-7", properties: { email: "ada@example.com" } },
    });
    const { handleHubSpotWebhookEvent } = await importWithRequiredEnv(() =>
      import("./index"),
    );

    await handleHubSpotWebhookEvent({
      hubSpotWebhookEventId: "hubspot-event-1",
      normalizedEvent: {
        type: "conversation.message.received",
        hubSpotObjectId: "thread-1",
        hubSpotMessageId: "msg-trigger",
      },
      rawWebhook: { eventId: 1001 },
    });

    expect(messagesCreate).toHaveBeenCalledTimes(1);

    const writebackUpdate = update.mock.calls
      .map((call) => call[0])
      .find((arg) => arg?.data?.writebackPlan !== undefined);

    expect(writebackUpdate).toMatchObject({
      where: { id: "workflow-run-1" },
      data: {
        writebackPlan: {
          kind: "writeback",
          fieldUpdates: [{ name: "pd_urgency", value: "high" }],
          note: "Suggested reply: thanks for reaching out — happy to set up a viewing this weekend.",
        },
        writebackPlanInput: expect.any(Object),
        writebackPlanRawOutputs: expect.any(Array),
        writebackPlanValidations: expect.any(Array),
      },
    });
    expect(writebackUpdate?.data?.writebackPlanValidations).toEqual([
      { ok: true },
    ]);

    expect(update).toHaveBeenCalledWith({
      where: { id: "workflow-run-1" },
      data: {
        status: "SUCCEEDED",
        outcome: "WRITEBACK_PROPOSED",
        completedAt: expect.any(Date),
      },
    });
  });

  test("passes the Current Conversation Session and triggering message id to the Claude prompt for inbound-message runs", async () => {
    upsert.mockResolvedValue({ id: "workflow-run-1" });
    update.mockResolvedValue({});
    configureInboundMessageHubSpot({
      thread: { id: "thread-1", associatedContactId: "contact-7" },
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
          results: [{ id: "msg-b", createdAt: "2026-05-12T11:00:00.000Z" }],
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
      },
      rawWebhook: { eventId: 1001 },
    });

    const promptInput = messagesCreate.mock.calls[0]?.[0];
    expect(promptInput).toBeDefined();
    const userMessage = (
      promptInput.messages[0].content as string
    );
    expect(userMessage).toContain("msg-c");
    expect(userMessage).toContain("msg-b");
    expect(userMessage).toContain("msg-a");
    expect(userMessage).toMatch(/Triggering message id:\s*```\s*msg-c\s*```/);
  });

  test("represents suggested replies inside proposed note content, not as a separate domain field", async () => {
    upsert.mockResolvedValue({ id: "workflow-run-1" });
    update.mockResolvedValue({});
    messagesCreate.mockResolvedValue(
      claudeWritebackPlanResponse({
        kind: "writeback",
        note: "Hi Ada — yes the property is still available. Want to book a tour Saturday at 11?",
      }),
    );
    configureInboundMessageHubSpot({
      thread: { id: "thread-1", associatedContactId: "contact-7" },
      contact: { id: "contact-7", properties: { email: "ada@example.com" } },
    });
    const { handleHubSpotWebhookEvent } = await importWithRequiredEnv(() =>
      import("./index"),
    );

    await handleHubSpotWebhookEvent({
      hubSpotWebhookEventId: "hubspot-event-1",
      normalizedEvent: {
        type: "conversation.message.received",
        hubSpotObjectId: "thread-1",
        hubSpotMessageId: "msg-trigger",
      },
      rawWebhook: { eventId: 1001 },
    });

    const writebackUpdate = update.mock.calls
      .map((call) => call[0])
      .find((arg) => arg?.data?.writebackPlan !== undefined);
    const storedPlan = writebackUpdate?.data?.writebackPlan as Record<
      string,
      unknown
    >;
    expect(storedPlan).toEqual({
      kind: "writeback",
      fieldUpdates: [],
      note: "Hi Ada — yes the property is still available. Want to book a tour Saturday at 11?",
    });
    expect(storedPlan).not.toHaveProperty("suggestedReply");
    expect(storedPlan).not.toHaveProperty("suggested_reply");
    expect(storedPlan).not.toHaveProperty("reply");
  });

  test("records a no_writeback HubSpot Writeback Plan for inbound-message runs when Claude returns no_writeback", async () => {
    upsert.mockResolvedValue({ id: "workflow-run-1" });
    update.mockResolvedValue({});
    messagesCreate.mockResolvedValue(
      claudeWritebackPlanResponse({
        kind: "no_writeback",
        reason: "Inbound message is a thank-you; nothing to enrich.",
      }),
    );
    configureInboundMessageHubSpot({
      thread: { id: "thread-1", associatedContactId: "contact-7" },
      contact: { id: "contact-7", properties: { email: "ada@example.com" } },
    });
    const { handleHubSpotWebhookEvent } = await importWithRequiredEnv(() =>
      import("./index"),
    );

    await handleHubSpotWebhookEvent({
      hubSpotWebhookEventId: "hubspot-event-1",
      normalizedEvent: {
        type: "conversation.message.received",
        hubSpotObjectId: "thread-1",
        hubSpotMessageId: "msg-trigger",
      },
      rawWebhook: { eventId: 1001 },
    });

    const writebackUpdate = update.mock.calls
      .map((call) => call[0])
      .find((arg) => arg?.data?.writebackPlan !== undefined);
    expect(writebackUpdate?.data?.writebackPlan).toEqual({
      kind: "no_writeback",
      reason: "Inbound message is a thank-you; nothing to enrich.",
    });

    expect(update).toHaveBeenCalledWith({
      where: { id: "workflow-run-1" },
      data: {
        status: "SUCCEEDED",
        outcome: "NO_WRITEBACK_NEEDED",
        completedAt: expect.any(Date),
      },
    });
  });

  test("fails the inbound-message HubSpot Workflow Run when both Claude attempts produce invalid plans, preserving the trace", async () => {
    upsert.mockResolvedValue({ id: "workflow-run-1" });
    update.mockResolvedValue({});
    messagesCreate
      .mockResolvedValueOnce(
        claudeWritebackPlanResponse({
          kind: "writeback",
          fieldUpdates: [{ name: "made_up_inbound_one", value: "x" }],
        }),
      )
      .mockResolvedValueOnce(
        claudeWritebackPlanResponse({
          kind: "writeback",
          fieldUpdates: [{ name: "made_up_inbound_two", value: "y" }],
        }),
      );
    configureInboundMessageHubSpot({
      thread: { id: "thread-1", associatedContactId: "contact-7" },
      contact: { id: "contact-7", properties: { email: "ada@example.com" } },
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
          hubSpotMessageId: "msg-trigger",
        },
        rawWebhook: { eventId: 1001 },
      }),
    ).rejects.toThrow(/valid HubSpot Writeback Plan/);

    expect(messagesCreate).toHaveBeenCalledTimes(2);

    const writebackUpdate = update.mock.calls
      .map((call) => call[0])
      .find((arg) => arg?.data?.writebackPlanInput !== undefined);
    expect(writebackUpdate?.data?.writebackPlan).toBe(Prisma.DbNull);
    expect(
      (writebackUpdate?.data?.writebackPlanRawOutputs as unknown[]).length,
    ).toBe(2);
    expect(
      (writebackUpdate?.data?.writebackPlanValidations as unknown[]).every(
        (v) => (v as { ok?: boolean }).ok === false,
      ),
    ).toBe(true);

    expect(update).toHaveBeenCalledWith({
      where: { id: "workflow-run-1" },
      data: {
        status: "FAILED",
        outcome: null,
        failureMessage: expect.stringMatching(/valid HubSpot Writeback Plan/),
        completedAt: expect.any(Date),
      },
    });
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
