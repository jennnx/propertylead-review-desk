import { beforeEach, describe, expect, test, vi } from "vitest";

import { importWithRequiredEnv } from "@/tests/env";

const createPendingHubSpotWriteback = vi.fn();
const markHubSpotWritebackAutoApplied = vi.fn();
const findHubSpotWritebackForApproval = vi.fn();
const getHubSpotWritebackAutoModeEnabled = vi.fn();
const getContact = vi.fn();
const updateContactProperties = vi.fn();
const createContactNote = vi.fn();

vi.mock("./mutations", () => ({
  createPendingHubSpotWriteback,
  markHubSpotWritebackAutoApplied,
}));

vi.mock("./queries", () => ({
  findHubSpotWritebackForApproval,
  getHubSpotWritebackAutoModeEnabled,
}));

vi.mock("@/services/hubspot", () => ({
  hubSpot: {
    getContact,
    updateContactProperties,
    createContactNote,
  },
  isWritableHubSpotPropertyName: (name: string) => name === "pd_urgency",
  normalizeWritableHubSpotPropertyValue: (
    _name: string,
    value: string | number | boolean | null,
  ) => value,
}));

describe("HubSpot Writeback handoff orchestrator", () => {
  beforeEach(() => {
    createPendingHubSpotWriteback.mockReset();
    createPendingHubSpotWriteback.mockResolvedValue({ id: "writeback-1" });
    markHubSpotWritebackAutoApplied.mockReset();
    markHubSpotWritebackAutoApplied.mockResolvedValue(true);
    findHubSpotWritebackForApproval.mockReset();
    getHubSpotWritebackAutoModeEnabled.mockReset();
    getHubSpotWritebackAutoModeEnabled.mockResolvedValue(false);
    getContact.mockReset();
    updateContactProperties.mockReset();
    createContactNote.mockReset();
  });

  test("leaves a finalized proposed HubSpot Writeback pending when Auto-Mode is off", async () => {
    const { handoffFinalizedHubSpotWriteback } = await importWithRequiredEnv(
      () => import("./handoff"),
    );

    await handoffFinalizedHubSpotWriteback({
      hubSpotWorkflowRunId: "workflow-run-1",
      plan: {
        kind: "writeback",
        fieldUpdates: [{ name: "pd_urgency", value: "high" }],
        note: null,
      },
    });

    expect(createPendingHubSpotWriteback).toHaveBeenCalledWith({
      hubSpotWorkflowRunId: "workflow-run-1",
      plan: {
        kind: "writeback",
        fieldUpdates: [{ name: "pd_urgency", value: "high" }],
        note: null,
      },
    });
    expect(updateContactProperties).not.toHaveBeenCalled();
    expect(markHubSpotWritebackAutoApplied).not.toHaveBeenCalled();
  });

  test("auto-applies a finalized proposed HubSpot Writeback when Auto-Mode is on", async () => {
    getHubSpotWritebackAutoModeEnabled.mockResolvedValue(true);
    findHubSpotWritebackForApproval.mockResolvedValue({
      id: "writeback-1",
      state: "PENDING",
      contactId: "contact-123",
      plan: {
        kind: "writeback",
        fieldUpdates: [{ name: "pd_urgency", value: "high" }],
        note: null,
      },
    });
    getContact.mockResolvedValue({
      id: "contact-123",
      properties: { pd_urgency: "normal" },
    });
    updateContactProperties.mockResolvedValue(undefined);

    const { handoffFinalizedHubSpotWriteback } = await importWithRequiredEnv(
      () => import("./handoff"),
    );

    await handoffFinalizedHubSpotWriteback({
      hubSpotWorkflowRunId: "workflow-run-1",
      plan: {
        kind: "writeback",
        fieldUpdates: [{ name: "pd_urgency", value: "high" }],
        note: null,
      },
    });

    expect(updateContactProperties).toHaveBeenCalledWith("contact-123", {
      pd_urgency: "high",
    });
    expect(markHubSpotWritebackAutoApplied).toHaveBeenCalledWith({
      id: "writeback-1",
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
  });

  test("leaves the HubSpot Writeback pending when Auto-Mode execution hits a transient HubSpot error", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    getHubSpotWritebackAutoModeEnabled.mockResolvedValue(true);
    findHubSpotWritebackForApproval.mockResolvedValue({
      id: "writeback-1",
      state: "PENDING",
      contactId: "contact-123",
      plan: {
        kind: "writeback",
        fieldUpdates: [{ name: "pd_urgency", value: "high" }],
        note: null,
      },
    });
    getContact.mockResolvedValue({
      id: "contact-123",
      properties: { pd_urgency: "normal" },
    });
    updateContactProperties.mockRejectedValue(
      new Error("HubSpot request failed with status 503"),
    );

    const { handoffFinalizedHubSpotWriteback } = await importWithRequiredEnv(
      () => import("./handoff"),
    );

    await handoffFinalizedHubSpotWriteback({
      hubSpotWorkflowRunId: "workflow-run-1",
      plan: {
        kind: "writeback",
        fieldUpdates: [{ name: "pd_urgency", value: "high" }],
        note: null,
      },
    });

    expect(markHubSpotWritebackAutoApplied).not.toHaveBeenCalled();
    expect(errorLog).toHaveBeenCalledWith(
      "Auto-Mode could not apply the HubSpot Writeback.",
      expect.objectContaining({
        hubSpotWorkflowRunId: "workflow-run-1",
        hubSpotWritebackId: "writeback-1",
        reason: "hubspot_error",
      }),
    );
  });

  test("logs when auto-apply succeeds but the HubSpot Writeback is no longer pending", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    getHubSpotWritebackAutoModeEnabled.mockResolvedValue(true);
    findHubSpotWritebackForApproval.mockResolvedValue({
      id: "writeback-1",
      state: "PENDING",
      contactId: "contact-123",
      plan: {
        kind: "writeback",
        fieldUpdates: [{ name: "pd_urgency", value: "high" }],
        note: null,
      },
    });
    getContact.mockResolvedValue({
      id: "contact-123",
      properties: { pd_urgency: "normal" },
    });
    updateContactProperties.mockResolvedValue(undefined);
    markHubSpotWritebackAutoApplied.mockResolvedValue(false);

    const { handoffFinalizedHubSpotWriteback } = await importWithRequiredEnv(
      () => import("./handoff"),
    );

    await handoffFinalizedHubSpotWriteback({
      hubSpotWorkflowRunId: "workflow-run-1",
      plan: {
        kind: "writeback",
        fieldUpdates: [{ name: "pd_urgency", value: "high" }],
        note: null,
      },
    });

    expect(errorLog).toHaveBeenCalledWith(
      "Auto-Mode applied HubSpot successfully, but the HubSpot Writeback was no longer pending.",
      expect.objectContaining({
        hubSpotWorkflowRunId: "workflow-run-1",
        hubSpotWritebackId: "writeback-1",
      }),
    );
  });
});
