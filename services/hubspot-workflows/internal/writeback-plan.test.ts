// Per ADR 0012: focused internal test of a pure validator transform; covers
// fine-grained accept/reject contracts the barrel test exercises only by
// proxy through Claude retry paths.

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

  test("formats markdown-like notes before accepting a writeback proposal", async () => {
    const { validateHubSpotWritebackPlan } = await importWithRequiredEnv(() =>
      import("./writeback-plan"),
    );

    const result = validateHubSpotWritebackPlan({
      kind: "writeback",
      note: '**Sample Buyer** is a buyer. Key signals: - Requested a tour: **Saturday morning** - Suggested reply: *"Does Saturday work?"*',
    });

    expect(result).toEqual({
      ok: true,
      plan: {
        kind: "writeback",
        fieldUpdates: [],
        note: [
          "Sample Buyer is a buyer. Key signals:",
          "- Requested a tour: Saturday morning",
          '- Suggested reply: "Does Saturday work?"',
        ].join("\n"),
      },
    });
  });

  test("formats bullet-symbol notes before accepting a writeback proposal", async () => {
    const { validateHubSpotWritebackPlan } = await importWithRequiredEnv(() =>
      import("./writeback-plan"),
    );

    const result = validateHubSpotWritebackPlan({
      kind: "writeback",
      note: '\u2022 Sample Buyer wants to tour **511 Test Road**.\n\u2022 Suggested reply: *"Does Saturday work?"*',
    });

    expect(result).toEqual({
      ok: true,
      plan: {
        kind: "writeback",
        fieldUpdates: [],
        note: [
          "- Sample Buyer wants to tour 511 Test Road.",
          '- Suggested reply: "Does Saturday work?"',
        ].join("\n"),
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

  test("normalizes HubSpot timezone values before accepting a writeback proposal", async () => {
    const { validateHubSpotWritebackPlan } = await importWithRequiredEnv(() =>
      import("./writeback-plan"),
    );

    const result = validateHubSpotWritebackPlan({
      kind: "writeback",
      fieldUpdates: [{ name: "hs_timezone", value: "America/Chicago" }],
    });

    expect(result).toEqual({
      ok: true,
      plan: {
        kind: "writeback",
        fieldUpdates: [{ name: "hs_timezone", value: "america_slash_chicago" }],
        note: null,
      },
    });
  });

  test("rejects enum values that are not allowed HubSpot option values", async () => {
    const { validateHubSpotWritebackPlan } = await importWithRequiredEnv(() =>
      import("./writeback-plan"),
    );

    const result = validateHubSpotWritebackPlan({
      kind: "writeback",
      fieldUpdates: [{ name: "pd_urgency", value: "urgent" }],
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.errors).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/pd_urgency.*not an allowed option value/),
      ]),
    );
  });

  test("rejects non-string enum values", async () => {
    const { validateHubSpotWritebackPlan } = await importWithRequiredEnv(() =>
      import("./writeback-plan"),
    );

    const result = validateHubSpotWritebackPlan({
      kind: "writeback",
      fieldUpdates: [{ name: "pd_urgency", value: 1 }],
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.errors).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/pd_urgency.*enumeration.*string option value/),
      ]),
    );
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

  test("rejects context-only and system-maintained fields", async () => {
    const { validateHubSpotWritebackPlan } = await importWithRequiredEnv(() =>
      import("./writeback-plan"),
    );

    const result = validateHubSpotWritebackPlan({
      kind: "writeback",
      fieldUpdates: [
        { name: "hs_analytics_source", value: "PAID_SOCIAL" },
        { name: "pd_last_enriched_at", value: "2026-05-13T16:12:00.000Z" },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.errors).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/hs_analytics_source.*context-only/i),
        expect.stringMatching(/pd_last_enriched_at.*context-only/i),
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
