import { describe, expect, test } from "vitest";

import { importWithRequiredEnv } from "@/tests/env";

describe("HubSpot Writeback Plan validation", () => {
  test("accepts a no-writeback plan with a reason", async () => {
    const { validateHubSpotWritebackPlan } = await importWithRequiredEnv(() =>
      import("./writeback-plan"),
    );

    const result = validateHubSpotWritebackPlan({
      kind: "no_writeback",
      reason: "Contact is missing email and phone; nothing to enrich yet.",
    });

    expect(result).toEqual({
      ok: true,
      plan: {
        kind: "no_writeback",
        reason: "Contact is missing email and phone; nothing to enrich yet.",
      },
    });
  });

  test("accepts a field-only writeback proposal whose fields target the Writable HubSpot Property Catalog", async () => {
    const { validateHubSpotWritebackPlan } = await importWithRequiredEnv(() =>
      import("./writeback-plan"),
    );

    const result = validateHubSpotWritebackPlan({
      kind: "writeback",
      fieldUpdates: [
        { name: "pd_urgency", value: "high" },
        { name: "pd_primary_intent", value: "request_showing" },
      ],
    });

    expect(result).toEqual({
      ok: true,
      plan: {
        kind: "writeback",
        fieldUpdates: [
          { name: "pd_urgency", value: "high" },
          { name: "pd_primary_intent", value: "request_showing" },
        ],
        note: null,
      },
    });
  });

  test("accepts a note-only writeback proposal", async () => {
    const { validateHubSpotWritebackPlan } = await importWithRequiredEnv(() =>
      import("./writeback-plan"),
    );

    const result = validateHubSpotWritebackPlan({
      kind: "writeback",
      note: "New lead from Zillow — recommend calling within the hour.",
    });

    expect(result).toEqual({
      ok: true,
      plan: {
        kind: "writeback",
        fieldUpdates: [],
        note: "New lead from Zillow — recommend calling within the hour.",
      },
    });
  });

  test("accepts a writeback proposal with both a field update and a note", async () => {
    const { validateHubSpotWritebackPlan } = await importWithRequiredEnv(() =>
      import("./writeback-plan"),
    );

    const result = validateHubSpotWritebackPlan({
      kind: "writeback",
      fieldUpdates: [{ name: "pd_urgency", value: "high" }],
      note: "Caller asked for a tour this weekend.",
    });

    expect(result).toEqual({
      ok: true,
      plan: {
        kind: "writeback",
        fieldUpdates: [{ name: "pd_urgency", value: "high" }],
        note: "Caller asked for a tour this weekend.",
      },
    });
  });

  test("rejects a writeback proposal whose field targets a property outside the catalog", async () => {
    const { validateHubSpotWritebackPlan } = await importWithRequiredEnv(() =>
      import("./writeback-plan"),
    );

    const result = validateHubSpotWritebackPlan({
      kind: "writeback",
      fieldUpdates: [{ name: "made_up_by_claude", value: "anything" }],
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.errors).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/made_up_by_claude/),
      ]),
    );
  });

  test("rejects an empty writeback proposal with no field updates and no note", async () => {
    const { validateHubSpotWritebackPlan } = await importWithRequiredEnv(() =>
      import("./writeback-plan"),
    );

    const result = validateHubSpotWritebackPlan({
      kind: "writeback",
      fieldUpdates: [],
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.errors).toEqual(
      expect.arrayContaining([expect.stringMatching(/empty/i)]),
    );
  });

  test("rejects a no-writeback proposal that also carries proposed writes", async () => {
    const { validateHubSpotWritebackPlan } = await importWithRequiredEnv(() =>
      import("./writeback-plan"),
    );

    const result = validateHubSpotWritebackPlan({
      kind: "no_writeback",
      reason: "Nothing to do",
      fieldUpdates: [{ name: "pd_urgency", value: "high" }],
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.errors).toEqual(
      expect.arrayContaining([expect.stringMatching(/no.writeback/i)]),
    );
  });

  test("rejects an unparseable plan shape", async () => {
    const { validateHubSpotWritebackPlan } = await importWithRequiredEnv(() =>
      import("./writeback-plan"),
    );

    const result = validateHubSpotWritebackPlan({ kind: "????" });

    expect(result.ok).toBe(false);
  });
});
