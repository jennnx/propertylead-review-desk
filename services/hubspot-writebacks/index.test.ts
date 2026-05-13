import { beforeEach, describe, expect, test, vi } from "vitest";

import { importWithRequiredEnv } from "@/tests/env";

const create = vi.fn();

vi.mock("@/services/database", () => ({
  getPrismaClient: () => ({
    hubSpotWriteback: {
      create,
    },
  }),
}));

describe("HubSpot writebacks service", () => {
  beforeEach(() => {
    create.mockReset();
    create.mockResolvedValue({});
  });

  test("persists a pending HubSpot Writeback carrying the proposed plan", async () => {
    const { recordProposedHubSpotWriteback } = await importWithRequiredEnv(
      () => import("./index"),
    );

    await recordProposedHubSpotWriteback({
      hubSpotWorkflowRunId: "workflow-run-1",
      plan: {
        kind: "writeback",
        fieldUpdates: [{ name: "pd_urgency", value: "high" }],
        note: "Hot lead from Zillow.",
      },
    });

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({
      data: {
        hubSpotWorkflowRunId: "workflow-run-1",
        plan: {
          kind: "writeback",
          fieldUpdates: [{ name: "pd_urgency", value: "high" }],
          note: "Hot lead from Zillow.",
        },
      },
    });
  });
});
