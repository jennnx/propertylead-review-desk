import { describe, expect, test } from "vitest";

import {
  getOperatorRecommendationSummary,
  getOperatorSuggestionStateCopy,
} from "./operator-copy";

describe("operator suggestion state copy", () => {
  test("APPLIED renders as approved with the approved tone", () => {
    expect(getOperatorSuggestionStateCopy("APPLIED")).toEqual({
      label: "approved",
      tone: "approved",
    });
  });

  test("AUTO_APPLIED renders as auto-approved with the approved tone", () => {
    expect(getOperatorSuggestionStateCopy("AUTO_APPLIED")).toEqual({
      label: "auto-approved",
      tone: "approved",
    });
  });

  test("REJECTED renders as rejected with the rejected tone", () => {
    expect(getOperatorSuggestionStateCopy("REJECTED")).toEqual({
      label: "rejected",
      tone: "rejected",
    });
  });

  test("PENDING renders as awaiting review with the awaiting tone", () => {
    expect(getOperatorSuggestionStateCopy("PENDING")).toEqual({
      label: "awaiting review",
      tone: "awaiting",
    });
  });
});

describe("operator recommendation summary", () => {
  test("describes both the field updates and the HubSpot note when both are present", () => {
    expect(
      getOperatorRecommendationSummary({
        fieldUpdates: [{ name: "pd_urgency" }, { name: "pd_stage" }],
        note: "Hot lead from Zillow.",
      }),
    ).toBe("The AI recommends updating 2 HubSpot fields and adding a HubSpot note.");
  });

  test("describes a single field update without pluralizing", () => {
    expect(
      getOperatorRecommendationSummary({
        fieldUpdates: [{ name: "pd_urgency" }],
        note: null,
      }),
    ).toBe("The AI recommends updating 1 HubSpot field.");
  });

  test("describes only the HubSpot note when there are no field updates", () => {
    expect(
      getOperatorRecommendationSummary({
        fieldUpdates: [],
        note: "Lead asked us to call back tomorrow.",
      }),
    ).toBe("The AI recommends adding a HubSpot note.");
  });

  test("falls back to the note phrasing when neither updates nor a note are present", () => {
    expect(
      getOperatorRecommendationSummary({
        fieldUpdates: [],
        note: null,
      }),
    ).toBe("The AI recommends adding a HubSpot note.");
  });

  test("never references Claude in operator-facing copy", () => {
    const summaries = [
      getOperatorRecommendationSummary({
        fieldUpdates: [{ name: "pd_urgency" }],
        note: "Hot lead.",
      }),
      getOperatorRecommendationSummary({
        fieldUpdates: [{ name: "pd_urgency" }],
        note: null,
      }),
      getOperatorRecommendationSummary({
        fieldUpdates: [],
        note: "Hot lead.",
      }),
    ];

    for (const summary of summaries) {
      expect(summary).not.toMatch(/claude/i);
    }
  });
});
