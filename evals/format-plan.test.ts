import { describe, expect, it } from "vitest";

import type { HubSpotWritebackPlanRequestResult } from "@/services/hubspot-workflows/internal/request-writeback-plan";

import { formatPlanForJudge } from "./format-plan";

const stubMaterial: HubSpotWritebackPlanRequestResult["input"] = {
  model: "claude-sonnet-4-6",
  system: "",
  userMessage: "",
  tool: {
    name: "propose_writeback_plan",
    description: "",
    input_schema: { type: "object" },
  },
};

describe("formatPlanForJudge", () => {
  it("renders a writeback plan with catalog labels, the verbatim note, and a raw JSON block", () => {
    const result: HubSpotWritebackPlanRequestResult = {
      input: stubMaterial,
      rawOutputs: [{}],
      validations: [{ ok: true }],
      acceptedPlan: {
        kind: "writeback",
        fieldUpdates: [
          { name: "pd_transaction_side", value: "buyer" },
          { name: "pd_urgency", value: "high" },
          { name: "pd_budget_max", value: 850000 },
        ],
        note: "Suggested next action: confirm Saturday 10:30am tour at 1247 Oak Ridge Dr.\n- Preapproved $850k, must close before Aug 31.",
      },
    };

    const prose = formatPlanForJudge(result);

    expect(prose).toContain("Decision: writeback");
    expect(prose).toContain("PropertyDesk Transaction Side (pd_transaction_side)");
    expect(prose).toContain('"buyer"');
    expect(prose).toContain("PropertyDesk Urgency (pd_urgency)");
    expect(prose).toContain('"high"');
    expect(prose).toContain("PropertyDesk Budget Max (pd_budget_max)");
    expect(prose).toContain("850000");
    expect(prose).toContain("Note (verbatim):");
    expect(prose).toContain(
      "Suggested next action: confirm Saturday 10:30am tour at 1247 Oak Ridge Dr.",
    );
    expect(prose).toContain("Preapproved $850k, must close before Aug 31.");
    expect(prose).toMatch(/```json[\s\S]+```/);
  });

  it("renders a no_writeback plan as Decision: no_writeback with the reason", () => {
    const result: HubSpotWritebackPlanRequestResult = {
      input: stubMaterial,
      rawOutputs: [{}],
      validations: [{ ok: true }],
      acceptedPlan: {
        kind: "no_writeback",
        reason:
          "Message is a single-word 'unsubscribe' reply with no actionable lead signal.",
      },
    };

    const prose = formatPlanForJudge(result);

    expect(prose).toContain("Decision: no_writeback");
    expect(prose).toContain(
      "Reason: Message is a single-word 'unsubscribe' reply with no actionable lead signal.",
    );
    expect(prose).not.toContain("Decision: writeback");
    expect(prose).not.toContain("Decision: invalid_output");
  });

  it("renders acceptedPlan === null as Decision: invalid_output with validation errors", () => {
    const result: HubSpotWritebackPlanRequestResult = {
      input: stubMaterial,
      rawOutputs: [{ kind: "garbage" }, { kind: "still_garbage" }],
      validations: [
        {
          ok: false,
          errors: [
            'kind: expected "writeback" or "no_writeback"',
            'field "pd_nonexistent" is not in the Writable HubSpot Property Catalog',
          ],
        },
        {
          ok: false,
          errors: ["Invalid input"],
        },
      ],
      acceptedPlan: null,
    };

    const prose = formatPlanForJudge(result);

    expect(prose).toContain("Decision: invalid_output");
    expect(prose).toContain('kind: expected "writeback" or "no_writeback"');
    expect(prose).toContain(
      'field "pd_nonexistent" is not in the Writable HubSpot Property Catalog',
    );
    expect(prose).toContain("Invalid input");
    expect(prose).toContain("Raw outputs:");
  });
});
