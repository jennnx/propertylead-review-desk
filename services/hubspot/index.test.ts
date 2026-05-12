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

  test("reads and creates HubSpot contact properties with the configured token", async () => {
    const fetchHubSpot = vi
      .fn()
      .mockResolvedValueOnce(
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
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            name: "pd_urgency",
          }),
          {
            status: 201,
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
    await client.createContactProperty({
      name: "pd_urgency",
      label: "PropertyDesk Urgency",
      groupName: "propertydesk_enrichment",
      type: "enumeration",
      fieldType: "select",
      options: [{ label: "high", value: "high" }],
    });

    expect(fetchHubSpot).toHaveBeenNthCalledWith(
      1,
      "https://api.hubapi.com/crm/v3/properties/contacts/email",
      {
        headers: {
          authorization: `Bearer ${REQUIRED_TEST_ENV.HUBSPOT_ACCESS_TOKEN}`,
          accept: "application/json",
        },
      },
    );
    expect(fetchHubSpot).toHaveBeenNthCalledWith(
      2,
      "https://api.hubapi.com/crm/v3/properties/contacts",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${REQUIRED_TEST_ENV.HUBSPOT_ACCESS_TOKEN}`,
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: "pd_urgency",
          label: "PropertyDesk Urgency",
          groupName: "propertydesk_enrichment",
          type: "enumeration",
          fieldType: "select",
          options: [{ label: "high", value: "high" }],
        }),
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

  test("sets up the Writable HubSpot Property Catalog without creating standard HubSpot properties", async () => {
    const hubSpot = {
      getContactProperty: vi
        .fn()
        .mockResolvedValueOnce({
          name: "email",
          label: "Email",
          type: "string",
          fieldType: "text",
        })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null),
      createContactProperty: vi.fn().mockResolvedValue({
        name: "pd_urgency",
      }),
    };

    const { setupWritableHubSpotPropertyCatalog } = await importWithRequiredEnv(
      () => import("./index"),
    );

    const result = await setupWritableHubSpotPropertyCatalog({
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
        {
          name: "firstname",
          label: "First name",
          type: "string",
          fieldType: "text",
          setup: "verify",
        },
      ],
    });

    expect(result).toEqual({
      created: ["pd_urgency"],
      verified: ["email"],
      failures: [
        {
          name: "firstname",
          reason: "missing_verification_only_property",
        },
      ],
    });
    expect(hubSpot.createContactProperty).toHaveBeenCalledTimes(1);
    expect(hubSpot.createContactProperty).toHaveBeenCalledWith({
      name: "pd_urgency",
      label: "PropertyDesk Urgency",
      groupName: "propertydesk_enrichment",
      type: "enumeration",
      fieldType: "select",
      options: [
        { label: "low", value: "low" },
        { label: "normal", value: "normal" },
        { label: "high", value: "high" },
        { label: "critical", value: "critical" },
        { label: "unknown", value: "unknown" },
      ],
    });
  });

  test("reports incompatible and arbitrary catalog entries without creating them", async () => {
    const hubSpot = {
      getContactProperty: vi.fn().mockResolvedValueOnce({
        name: "pd_urgency",
        label: "PropertyDesk Urgency",
        type: "string",
        fieldType: "text",
      }),
      createContactProperty: vi.fn(),
    };

    const { setupWritableHubSpotPropertyCatalog } = await importWithRequiredEnv(
      () => import("./index"),
    );

    const result = await setupWritableHubSpotPropertyCatalog({
      hubSpot,
      catalog: [
        {
          name: "pd_urgency",
          label: "PropertyDesk Urgency",
          type: "enumeration",
          fieldType: "select",
          setup: "create",
          options: ["low", "normal", "high", "critical", "unknown"],
        },
        {
          name: "made_up_by_claude",
          label: "Made Up By Claude",
          type: "string",
          fieldType: "text",
          setup: "create",
        },
      ],
    });

    expect(result).toEqual({
      created: [],
      verified: [],
      failures: [
        {
          name: "pd_urgency",
          reason: "incompatible_property_metadata",
        },
        {
          name: "made_up_by_claude",
          reason: "not_in_static_catalog",
        },
      ],
    });
    expect(hubSpot.createContactProperty).not.toHaveBeenCalled();
  });
});
