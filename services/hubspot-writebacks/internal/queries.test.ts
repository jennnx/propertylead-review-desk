import { beforeEach, describe, expect, test, vi } from "vitest";

import { importWithRequiredEnv } from "@/tests/env";

const findMany = vi.fn();

vi.mock("@/services/database", () => ({
  getPrismaClient: () => ({
    hubSpotWriteback: {
      findMany,
    },
  }),
}));

vi.mock("@/services/hubspot", () => ({
  WRITABLE_HUBSPOT_PROPERTY_CATALOG: [
    { name: "pd_urgency", label: "Urgency" },
  ],
}));

describe("HubSpot writeback review queries", () => {
  beforeEach(() => {
    findMany.mockReset();
  });

  test("reads pending and decided writebacks through separate Review Desk APIs", async () => {
    const pendingWriteback = buildReviewRow({
      id: "pending-1",
      state: "PENDING",
      reviewDeskFeedbackNote: null,
      appliedAt: null,
    });
    const appliedWriteback = buildReviewRow({
      id: "applied-1",
      state: "APPLIED",
      reviewDeskFeedbackNote: "Looks right.",
      appliedAt: new Date("2026-05-13T16:00:00.000Z"),
    });
    const rejectedWriteback = buildReviewRow({
      id: "rejected-1",
      state: "REJECTED",
      reviewDeskFeedbackNote: "Lead asked us to pause.",
      appliedAt: null,
    });
    findMany
      .mockResolvedValueOnce([pendingWriteback])
      .mockResolvedValueOnce([appliedWriteback, rejectedWriteback]);

    const {
      listPendingHubSpotWritebackReviewItems,
      listDecidedHubSpotWritebackReviewItems,
    } = await importWithRequiredEnv(() => import("./queries"));

    const pending = await listPendingHubSpotWritebackReviewItems();
    const history = await listDecidedHubSpotWritebackReviewItems();

    expect(findMany).toHaveBeenCalledTimes(2);
    expect(pending.map((writeback) => writeback.id)).toEqual(["pending-1"]);
    expect(history.map((writeback) => writeback.id)).toEqual([
      "applied-1",
      "rejected-1",
    ]);
  });
});

function buildReviewRow({
  id,
  state,
  reviewDeskFeedbackNote,
  appliedAt,
}: {
  id: string;
  state: "PENDING" | "APPLIED" | "AUTO_APPLIED" | "REJECTED";
  reviewDeskFeedbackNote: string | null;
  appliedAt: Date | null;
}) {
  return {
    id,
    state,
    plan: {
      kind: "writeback",
      fieldUpdates: [{ name: "pd_urgency", value: "high" }],
      note: null,
    },
    reviewDeskFeedbackNote,
    appliedAt,
    createdAt: new Date("2026-05-13T15:00:00.000Z"),
    hubSpotWorkflowRun: {
      enrichmentInputContext: {
        source: "hubspot",
        contact: {
          id: "contact-123",
          properties: {
            firstname: "Ana",
            lastname: "Lead",
            email: "ana@example.com",
          },
        },
      },
      writebackPlanRawOutputs: [
        { reasoning: "The lead is ready for follow-up." },
      ],
      hubSpotWebhookEvent: {
        normalizedEvent: {
          type: "contact.created",
          hubSpotObjectId: "contact-123",
          hubSpotPortalId: null,
          occurredAt: null,
        },
      },
    },
  };
}
