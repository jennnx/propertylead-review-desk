import { afterEach, describe, expect, test, vi } from "vitest";

import { importWithRequiredEnv, REQUIRED_TEST_ENV } from "@/tests/env";

import { WRITABLE_HUBSPOT_PROPERTY_CATALOG } from "./internal/catalog";
import type {
  HubSpotContactProperty,
  WritableHubSpotPropertyCatalogEntry,
} from "./index";

function compatiblePropertyResponse(
  entry: WritableHubSpotPropertyCatalogEntry,
): HubSpotContactProperty {
  return {
    name: entry.name,
    label: entry.label,
    type: entry.type,
    fieldType: entry.fieldType,
    ...(entry.options
      ? { options: entry.options.map((value) => ({ value })) }
      : {}),
  };
}

type CatalogFetchOverride = HubSpotContactProperty | "missing";

function stubFetchForCatalog(
  overrides: Record<string, CatalogFetchOverride> = {},
): ReturnType<typeof vi.fn> {
  const fetch = vi.fn().mockImplementation(async (url: string) => {
    const match = url.match(/\/crm\/v3\/properties\/contacts\/([^/?]+)$/);
    if (!match) throw new Error(`Unexpected HubSpot fetch URL: ${url}`);
    const name = decodeURIComponent(match[1]);

    const override = overrides[name];
    if (override === "missing") {
      return new Response(JSON.stringify({ message: "not found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }
    if (override) {
      return new Response(JSON.stringify(override), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    const entry = WRITABLE_HUBSPOT_PROPERTY_CATALOG.find(
      (candidate) => candidate.name === name,
    );
    if (!entry) {
      return new Response(JSON.stringify({ message: "not found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify(compatiblePropertyResponse(entry)), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });

  vi.stubGlobal("fetch", fetch);
  return fetch;
}

describe("HubSpot service", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

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
    vi.stubGlobal("fetch", fetchHubSpot);

    const { hubSpot } = await importWithRequiredEnv(() => import("./index"));

    const contact = await hubSpot.getContact("123", {
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

  test("updates HubSpot contact properties with the configured HubSpot Access Token", async () => {
    const fetchHubSpot = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "123", properties: {} }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchHubSpot);

    const { hubSpot } = await importWithRequiredEnv(() => import("./index"));

    await hubSpot.updateContactProperties("123", {
      pd_urgency: "high",
    });

    expect(fetchHubSpot).toHaveBeenCalledWith(
      "https://api.hubapi.com/crm/v3/objects/contacts/123",
      {
        method: "PATCH",
        body: JSON.stringify({
          properties: {
            pd_urgency: "high",
          },
        }),
        headers: {
          authorization: `Bearer ${REQUIRED_TEST_ENV.HUBSPOT_ACCESS_TOKEN}`,
          accept: "application/json",
          "content-type": "application/json",
        },
      },
    );
  });

  test("creates a HubSpot note associated to a contact", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-13T21:00:00.000Z"));
    const fetchHubSpot = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "note-123" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchHubSpot);

    const { hubSpot } = await importWithRequiredEnv(() => import("./index"));

    await expect(
      hubSpot.createContactNote("contact-123", {
        body: "Jane asked for a Saturday showing.",
      }),
    ).resolves.toEqual({ id: "note-123" });

    expect(fetchHubSpot).toHaveBeenCalledWith(
      "https://api.hubapi.com/crm/v3/objects/notes",
      {
        method: "POST",
        body: JSON.stringify({
          associations: [
            {
              to: { id: "contact-123" },
              types: [
                {
                  associationCategory: "HUBSPOT_DEFINED",
                  associationTypeId: 202,
                },
              ],
            },
          ],
          properties: {
            hs_note_body: "Jane asked for a Saturday showing.",
            hs_timestamp: "2026-05-13T21:00:00.000Z",
          },
        }),
        headers: {
          authorization: `Bearer ${REQUIRED_TEST_ENV.HUBSPOT_ACCESS_TOKEN}`,
          accept: "application/json",
          "content-type": "application/json",
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
    vi.stubGlobal("fetch", fetchHubSpot);

    const { hubSpot } = await importWithRequiredEnv(() => import("./index"));

    const thread = await hubSpot.getConversationThreadMessages("thread-123");

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
    vi.stubGlobal("fetch", fetchHubSpot);

    const { hubSpot } = await importWithRequiredEnv(() => import("./index"));

    const thread = await hubSpot.getConversationThreadMessages("thread-123", {
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
    vi.stubGlobal("fetch", fetchHubSpot);

    const { hubSpot } = await importWithRequiredEnv(() => import("./index"));

    const thread = await hubSpot.getConversationThreadMessages("thread-123", {
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
    vi.stubGlobal("fetch", fetchHubSpot);

    const { hubSpot } = await importWithRequiredEnv(() => import("./index"));

    const thread = await hubSpot.getConversationThreadMessages("thread-123", {
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
    vi.stubGlobal("fetch", fetchHubSpot);

    const { hubSpot } = await importWithRequiredEnv(() => import("./index"));

    const threadList = await hubSpot.listConversationThreads({
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
    vi.stubGlobal("fetch", fetchHubSpot);

    const { hubSpot } = await importWithRequiredEnv(() => import("./index"));

    await expect(hubSpot.getContactProperty("email")).resolves.toEqual({
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
    vi.stubGlobal("fetch", fetchHubSpot);

    const { hubSpot } = await importWithRequiredEnv(() => import("./index"));

    await expect(hubSpot.getContactProperty("pd_urgency")).resolves.toBeNull();
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
    vi.stubGlobal("fetch", fetchHubSpot);

    const { hubSpot } = await importWithRequiredEnv(() => import("./index"));

    await expect(
      hubSpot.getContact("123", { properties: ["email"] }),
    ).rejects.toThrow(/status 401.*Unauthorized/);
  });

  test("represents the approved Writable HubSpot Property Catalog and rejects arbitrary properties", async () => {
    const {
      WRITABLE_HUBSPOT_PROPERTY_CATALOG: catalog,
      isWritableHubSpotPropertyName,
    } = await importWithRequiredEnv(() => import("./index"));

    expect(catalog).toEqual(
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

  test("verifies every Writable HubSpot Property Catalog entry against HubSpot", async () => {
    stubFetchForCatalog();

    const { verifyWritableHubSpotPropertyCatalog } =
      await importWithRequiredEnv(() => import("./index"));

    const result = await verifyWritableHubSpotPropertyCatalog();

    expect(result.failures).toEqual([]);
    expect(result.verified).toEqual(
      WRITABLE_HUBSPOT_PROPERTY_CATALOG.map((entry) => entry.name),
    );
  });

  test("reports missing and incompatible catalog entries as failures", async () => {
    stubFetchForCatalog({
      email: "missing",
      pd_urgency: {
        name: "pd_urgency",
        label: "PropertyDesk Urgency",
        type: "string",
        fieldType: "text",
      },
      pd_buy_readiness: {
        name: "pd_buy_readiness",
        label: "PropertyDesk Buy Readiness",
        type: "enumeration",
        fieldType: "select",
        options: [{ value: "browsing" }, { value: "wants_showing" }],
      },
    });

    const { verifyWritableHubSpotPropertyCatalog } =
      await importWithRequiredEnv(() => import("./index"));

    const result = await verifyWritableHubSpotPropertyCatalog();

    expect(result.failures).toEqual(
      expect.arrayContaining([
        { name: "email", reason: "missing" },
        { name: "pd_urgency", reason: "incompatible_property_metadata" },
        {
          name: "pd_buy_readiness",
          reason: "incompatible_property_metadata",
        },
      ]),
    );
    expect(result.verified).not.toContain("email");
    expect(result.verified).not.toContain("pd_urgency");
    expect(result.verified).not.toContain("pd_buy_readiness");
  });

  test("boot logs success and does not exit when every catalog entry verifies", async () => {
    stubFetchForCatalog();
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorLog = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const exit = vi
      .spyOn(process, "exit")
      .mockImplementation((() => undefined) as never);

    const { verifyWritableHubSpotPropertyCatalogOnBoot } =
      await importWithRequiredEnv(() => import("./index"));

    await verifyWritableHubSpotPropertyCatalogOnBoot({ processName: "next" });

    expect(exit).not.toHaveBeenCalled();
    expect(errorLog).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      `hubspot[next]: Writable HubSpot Property Catalog verified (${WRITABLE_HUBSPOT_PROPERTY_CATALOG.length} entries)`,
    );
  });

  test("boot logs each failure and exits non-zero when verification reports failures", async () => {
    stubFetchForCatalog({
      pd_urgency: "missing",
      pd_buy_readiness: {
        name: "pd_buy_readiness",
        label: "PropertyDesk Buy Readiness",
        type: "string",
        fieldType: "text",
      },
    });
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorLog = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const exit = vi
      .spyOn(process, "exit")
      .mockImplementation((() => undefined) as never);

    const { verifyWritableHubSpotPropertyCatalogOnBoot } =
      await importWithRequiredEnv(() => import("./index"));

    await verifyWritableHubSpotPropertyCatalogOnBoot({ processName: "worker" });

    expect(exit).toHaveBeenCalledWith(1);
    expect(log).not.toHaveBeenCalled();
    expect(errorLog.mock.calls.map((call) => call[0])).toEqual([
      "hubspot[worker]: Writable HubSpot Property Catalog verification failed",
      "hubspot[worker]: pd_urgency: missing",
      "hubspot[worker]: pd_buy_readiness: incompatible_property_metadata",
    ]);
  });
});
