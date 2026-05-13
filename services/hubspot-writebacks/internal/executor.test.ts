import { describe, expect, test } from "vitest";

import { importWithRequiredEnv } from "@/tests/env";

describe("HubSpot Writeback Plan executor", () => {
  test("applies field updates and returns before-after metadata", async () => {
    const updatedContacts: unknown[] = [];
    const hubSpot = {
      async getContact() {
        return {
          id: "contact-123",
          properties: {
            pd_urgency: "normal",
          },
        };
      },
      async updateContactProperties(contactId: string, properties: unknown) {
        updatedContacts.push({ contactId, properties });
      },
      async createContactNote() {
        throw new Error("note should not be created for a field-only plan");
      },
    };

    const { executeHubSpotWritebackPlan } = await importWithRequiredEnv(() =>
      import("./executor"),
    );

    const result = await executeHubSpotWritebackPlan({
      contactId: "contact-123",
      plan: {
        kind: "writeback",
        fieldUpdates: [{ name: "pd_urgency", value: "high" }],
        note: null,
      },
      hubSpot,
    });

    expect(result).toEqual({
      ok: true,
      metadata: {
        fieldUpdates: [
          {
            name: "pd_urgency",
            previousValue: "normal",
            proposedValue: "high",
            result: "applied",
          },
        ],
        note: null,
      },
    });
    expect(updatedContacts).toEqual([
      {
        contactId: "contact-123",
        properties: {
          pd_urgency: "high",
        },
      },
    ]);
  });

  test("creates a HubSpot note for a note-only plan", async () => {
    const createdNotes: unknown[] = [];
    const hubSpot = {
      async getContact() {
        throw new Error("contact should not be read for a note-only plan");
      },
      async updateContactProperties() {
        throw new Error("contact should not be updated for a note-only plan");
      },
      async createContactNote(contactId: string, input: unknown) {
        createdNotes.push({ contactId, input });
        return { id: "note-123" };
      },
    };
    const { executeHubSpotWritebackPlan } = await importWithRequiredEnv(() =>
      import("./executor"),
    );

    const result = await executeHubSpotWritebackPlan({
      contactId: "contact-123",
      plan: {
        kind: "writeback",
        fieldUpdates: [],
        note: "Jane asked for a Saturday showing.",
      },
      hubSpot,
    });

    expect(result).toEqual({
      ok: true,
      metadata: {
        fieldUpdates: [],
        note: { id: "note-123" },
      },
    });
    expect(createdNotes).toEqual([
      {
        contactId: "contact-123",
        input: { body: "Jane asked for a Saturday showing." },
      },
    ]);
  });

  test("rejects an out-of-catalog field before calling HubSpot", async () => {
    const hubSpotCalls: string[] = [];
    const hubSpot = {
      async getContact() {
        hubSpotCalls.push("getContact");
        return { id: "contact-123", properties: {} };
      },
      async updateContactProperties() {
        hubSpotCalls.push("updateContactProperties");
      },
      async createContactNote() {
        hubSpotCalls.push("createContactNote");
        return { id: "note-123" };
      },
    };
    const { executeHubSpotWritebackPlan } = await importWithRequiredEnv(() =>
      import("./executor"),
    );

    const result = await executeHubSpotWritebackPlan({
      contactId: "contact-123",
      plan: {
        kind: "writeback",
        fieldUpdates: [{ name: "made_up_property", value: "high" }],
        note: null,
      },
      hubSpot,
    });

    expect(result).toEqual({
      ok: false,
      reason: "invalid_plan",
      message:
        'field "made_up_property" is not in the Writable HubSpot Property Catalog',
    });
    expect(hubSpotCalls).toEqual([]);
  });

  test("surfaces HubSpot failures as structured retryable errors", async () => {
    const hubSpot = {
      async getContact() {
        return {
          id: "contact-123",
          properties: {
            pd_urgency: "normal",
          },
        };
      },
      async updateContactProperties() {
        throw new Error("HubSpot request failed with status 503");
      },
      async createContactNote() {
        throw new Error("note should not be created after update failure");
      },
    };
    const { executeHubSpotWritebackPlan } = await importWithRequiredEnv(() =>
      import("./executor"),
    );

    const result = await executeHubSpotWritebackPlan({
      contactId: "contact-123",
      plan: {
        kind: "writeback",
        fieldUpdates: [{ name: "pd_urgency", value: "high" }],
        note: null,
      },
      hubSpot,
    });

    expect(result).toEqual({
      ok: false,
      reason: "hubspot_error",
      message: "HubSpot request failed with status 503",
    });
  });
});
