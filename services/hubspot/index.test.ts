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

  test("reads a HubSpot Conversations thread with a bounded message limit", async () => {
    const fetchHubSpot = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            {
              id: "message-1",
              text: "Can I tour this weekend?",
              truncationStatus: "NOT_TRUNCATED",
            },
          ],
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
    const thread = await client.getConversationThreadMessages("thread-123");

    expect(thread).toEqual({
      results: [
        {
          id: "message-1",
          text: "Can I tour this weekend?",
          truncationStatus: "NOT_TRUNCATED",
        },
      ],
    });
    expect(fetchHubSpot).toHaveBeenCalledWith(
      "https://api.hubapi.com/conversations/v3/conversations/threads/thread-123/messages?limit=30",
      {
        headers: {
          authorization: `Bearer ${REQUIRED_TEST_ENV.HUBSPOT_ACCESS_TOKEN}`,
          accept: "application/json",
        },
      },
    );
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
