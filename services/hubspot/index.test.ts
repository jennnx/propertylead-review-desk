import { describe, expect, test, vi } from "vitest";

import { importWithRequiredEnv, REQUIRED_TEST_ENV } from "@/tests/env";

describe("HubSpot service", () => {
  test("reads a HubSpot contact with the configured HubSpot Access Token", async () => {
    const fetchHubSpot = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "123",
          properties: {
            email: "ada@example.com",
            pd_urgency: "high",
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );

    const { createHubSpotClient } = await importWithRequiredEnv(() =>
      import("./index"),
    );

    const client = createHubSpotClient({ fetch: fetchHubSpot });
    const contact = await client.getContact("123", {
      properties: ["email", "pd_urgency"],
    });

    expect(contact).toEqual({
      id: "123",
      properties: {
        email: "ada@example.com",
        pd_urgency: "high",
      },
    });
    expect(fetchHubSpot).toHaveBeenCalledWith(
      "https://api.hubapi.com/crm/v3/objects/contacts/123?properties=email%2Cpd_urgency",
      {
        headers: {
          authorization: `Bearer ${REQUIRED_TEST_ENV.HUBSPOT_ACCESS_TOKEN}`,
          accept: "application/json",
        },
      },
    );
  });

  test("returns all messages of a single-page thread shorter than the requested limit", async () => {
    const fetchHubSpot = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            {
              id: "message-1",
              text: "Can I tour this weekend?",
              truncationStatus: "NOT_TRUNCATED",
            },
            {
              id: "message-2",
              text: "Sure — Saturday at 2?",
              truncationStatus: "NOT_TRUNCATED",
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const { createHubSpotClient } = await importWithRequiredEnv(() =>
      import("./index"),
    );

    const client = createHubSpotClient({ fetch: fetchHubSpot });
    const thread = await client.getConversationThreadMessages("thread-123");

    expect(thread.results.map((m) => (m as { id: string }).id)).toEqual([
      "message-1",
      "message-2",
    ]);
    expect(fetchHubSpot).toHaveBeenCalledTimes(1);
    expect(fetchHubSpot.mock.calls[0][0]).toBe(
      "https://api.hubapi.com/conversations/v3/conversations/threads/thread-123/messages?limit=100",
    );
    expect(fetchHubSpot.mock.calls[0][1]).toEqual({
      headers: {
        authorization: `Bearer ${REQUIRED_TEST_ENV.HUBSPOT_ACCESS_TOKEN}`,
        accept: "application/json",
      },
    });
  });

  test("returns no messages and skips HubSpot when limit is zero", async () => {
    const fetchHubSpot = vi.fn();

    const { createHubSpotClient } = await importWithRequiredEnv(() =>
      import("./index"),
    );

    const client = createHubSpotClient({ fetch: fetchHubSpot });
    const thread = await client.getConversationThreadMessages("thread-123", {
      limit: 0,
    });

    expect(thread).toEqual({ results: [] });
    expect(fetchHubSpot).not.toHaveBeenCalled();
  });

  test("returns the latest N messages from a single page that holds more than the limit", async () => {
    const fetchHubSpot = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            { id: "message-1" },
            { id: "message-2" },
            { id: "message-3" },
            { id: "message-4" },
            { id: "message-5" },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const { createHubSpotClient } = await importWithRequiredEnv(() =>
      import("./index"),
    );

    const client = createHubSpotClient({ fetch: fetchHubSpot });
    const thread = await client.getConversationThreadMessages("thread-123", {
      limit: 2,
    });

    expect(thread.results.map((m) => (m as { id: string }).id)).toEqual([
      "message-4",
      "message-5",
    ]);
    expect(fetchHubSpot).toHaveBeenCalledTimes(1);
  });

  test("returns the latest N messages across paged thread responses, oldest-first within the slice", async () => {
    const message = (id: number) => ({
      id: `message-${id}`,
      text: `m${id}`,
      truncationStatus: "NOT_TRUNCATED",
    });

    const fetchHubSpot = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            results: [message(1), message(2), message(3), message(4)],
            paging: { next: { after: "cursor-2" } },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            results: [message(5), message(6), message(7)],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );

    const { createHubSpotClient } = await importWithRequiredEnv(() =>
      import("./index"),
    );

    const client = createHubSpotClient({ fetch: fetchHubSpot });
    const thread = await client.getConversationThreadMessages("thread-123", {
      limit: 3,
    });

    expect(thread.results.map((m) => (m as { id: string }).id)).toEqual([
      "message-5",
      "message-6",
      "message-7",
    ]);
    expect(fetchHubSpot).toHaveBeenCalledTimes(2);
    expect(fetchHubSpot.mock.calls[1][0]).toContain("after=cursor-2");
  });

  test("lists HubSpot Conversations threads for a contact across paged responses", async () => {
    const fetchHubSpot = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            results: [
              { id: "thread-1", associatedContactId: "contact-7" },
              { id: "thread-2", associatedContactId: "contact-7" },
            ],
            paging: { next: { after: "cursor-2" } },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            results: [{ id: "thread-3", associatedContactId: "contact-7" }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );

    const { createHubSpotClient } = await importWithRequiredEnv(() =>
      import("./index"),
    );

    const client = createHubSpotClient({ fetch: fetchHubSpot });
    const threadList = await client.listConversationThreads({
      associatedContactId: "contact-7",
    });

    expect(threadList.results.map((thread) => thread.id)).toEqual([
      "thread-1",
      "thread-2",
      "thread-3",
    ]);
    expect(fetchHubSpot).toHaveBeenCalledTimes(2);
    expect(fetchHubSpot.mock.calls[0][0]).toBe(
      "https://api.hubapi.com/conversations/v3/conversations/threads?associatedContactId=contact-7&limit=100",
    );
    expect(fetchHubSpot.mock.calls[1][0]).toBe(
      "https://api.hubapi.com/conversations/v3/conversations/threads?associatedContactId=contact-7&limit=100&after=cursor-2",
    );
  });

  test("reads a HubSpot contact property with the configured token", async () => {
    const fetchHubSpot = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          name: "email",
          label: "Email",
          type: "string",
          fieldType: "text",
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );

    const { createHubSpotClient } = await importWithRequiredEnv(() =>
      import("./index"),
    );

    const client = createHubSpotClient({ fetch: fetchHubSpot });
    await expect(client.getContactProperty("email")).resolves.toEqual({
      name: "email",
      label: "Email",
      type: "string",
      fieldType: "text",
    });
    expect(fetchHubSpot).toHaveBeenCalledWith(
      "https://api.hubapi.com/crm/v3/properties/contacts/email",
      {
        headers: {
          authorization: `Bearer ${REQUIRED_TEST_ENV.HUBSPOT_ACCESS_TOKEN}`,
          accept: "application/json",
        },
      },
    );
  });

  test("treats a missing HubSpot contact property as absent", async () => {
    const fetchHubSpot = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "not found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      }),
    );

    const { createHubSpotClient } = await importWithRequiredEnv(() =>
      import("./index"),
    );

    const client = createHubSpotClient({ fetch: fetchHubSpot });

    await expect(client.getContactProperty("pd_urgency")).resolves.toBeNull();
  });

  test("surfaces HubSpot error bodies in non-2xx responses", async () => {
    const fetchHubSpot = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "error",
          message: "Unauthorized",
          correlationId: "abc-123",
        }),
        {
          status: 401,
          headers: { "content-type": "application/json" },
        },
      ),
    );

    const { createHubSpotClient } = await importWithRequiredEnv(() =>
      import("./index"),
    );

    const client = createHubSpotClient({ fetch: fetchHubSpot });

    await expect(
      client.getContact("123", { properties: ["email"] }),
    ).rejects.toThrow(/status 401.*Unauthorized/);
  });

  test("represents the approved Writable HubSpot Property Catalog and rejects arbitrary properties", async () => {
    const {
      WRITABLE_HUBSPOT_PROPERTY_CATALOG,
      isWritableHubSpotPropertyName,
    } = await importWithRequiredEnv(() => import("./index"));

    expect(WRITABLE_HUBSPOT_PROPERTY_CATALOG).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "email",
          label: "Email",
          setup: "verify",
        }),
        expect.objectContaining({
          name: "pd_urgency",
          label: "PropertyDesk Urgency",
          setup: "create",
          type: "enumeration",
          fieldType: "select",
          options: ["low", "normal", "high", "critical", "unknown"],
        }),
        expect.objectContaining({
          name: "pd_last_enriched_at",
          label: "PropertyDesk Last Enriched At",
          setup: "create",
          controlledBy: "system",
        }),
      ]),
    );
    expect(isWritableHubSpotPropertyName("pd_urgency")).toBe(true);
    expect(isWritableHubSpotPropertyName("hs_lead_status")).toBe(false);
    expect(isWritableHubSpotPropertyName("made_up_by_claude")).toBe(false);
  });

  test("verifies catalog entries are present in HubSpot with compatible metadata", async () => {
    const hubSpot = {
      getContactProperty: vi
        .fn()
        .mockResolvedValueOnce({
          name: "email",
          label: "Email",
          type: "string",
          fieldType: "text",
        })
        .mockResolvedValueOnce({
          name: "pd_urgency",
          label: "PropertyDesk Urgency",
          type: "enumeration",
          fieldType: "select",
          options: [
            { value: "low" },
            { value: "normal" },
            { value: "high" },
            { value: "critical" },
            { value: "unknown" },
            { value: "operator_added" },
          ],
        }),
    };

    const { verifyWritableHubSpotPropertyCatalog } = await importWithRequiredEnv(
      () => import("./index"),
    );

    const result = await verifyWritableHubSpotPropertyCatalog({
      hubSpot,
      catalog: [
        {
          name: "email",
          label: "Email",
          type: "string",
          fieldType: "text",
          setup: "verify",
        },
        {
          name: "pd_urgency",
          label: "PropertyDesk Urgency",
          type: "enumeration",
          fieldType: "select",
          setup: "create",
          options: ["low", "normal", "high", "critical", "unknown"],
        },
      ],
    });

    expect(result).toEqual({
      verified: ["email", "pd_urgency"],
      failures: [],
    });
  });

  test("reports missing and incompatible catalog entries as failures", async () => {
    const hubSpot = {
      getContactProperty: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          name: "pd_urgency",
          label: "PropertyDesk Urgency",
          type: "string",
          fieldType: "text",
        })
        .mockResolvedValueOnce({
          name: "pd_buy_readiness",
          label: "PropertyDesk Buy Readiness",
          type: "enumeration",
          fieldType: "select",
          options: [{ value: "browsing" }, { value: "wants_showing" }],
        }),
    };

    const { verifyWritableHubSpotPropertyCatalog } = await importWithRequiredEnv(
      () => import("./index"),
    );

    const result = await verifyWritableHubSpotPropertyCatalog({
      hubSpot,
      catalog: [
        {
          name: "firstname",
          label: "First name",
          type: "string",
          fieldType: "text",
          setup: "verify",
        },
        {
          name: "pd_urgency",
          label: "PropertyDesk Urgency",
          type: "enumeration",
          fieldType: "select",
          setup: "create",
          options: ["low", "normal", "high", "critical", "unknown"],
        },
        {
          name: "pd_buy_readiness",
          label: "PropertyDesk Buy Readiness",
          type: "enumeration",
          fieldType: "select",
          setup: "create",
          options: [
            "browsing",
            "wants_showing",
            "actively_touring",
            "preapproved",
            "offer_ready",
            "not_buying",
            "unknown",
          ],
        },
      ],
    });

    expect(result).toEqual({
      verified: [],
      failures: [
        { name: "firstname", reason: "missing" },
        { name: "pd_urgency", reason: "incompatible_property_metadata" },
        {
          name: "pd_buy_readiness",
          reason: "incompatible_property_metadata",
        },
      ],
    });
  });
});
