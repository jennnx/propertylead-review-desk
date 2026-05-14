import { beforeEach, describe, expect, test, vi } from "vitest";

import { importWithRequiredEnv } from "@/tests/env";

const create = vi.fn();
const findHubSpotWritebackForApproval = vi.fn();
const markHubSpotWritebackApplied = vi.fn();
const markHubSpotWritebackRejected = vi.fn();
const updateHubSpotWritebackFeedbackNote = vi.fn();
const getContact = vi.fn();
const updateContactProperties = vi.fn();
const createContactNote = vi.fn();

vi.mock("@/services/database", () => ({
  getPrismaClient: () => ({
    hubSpotWriteback: {
      create,
    },
  }),
}));

vi.mock("./internal/queries", () => ({
  findHubSpotWritebackForApproval,
}));

vi.mock("./internal/mutations", () => ({
  createPendingHubSpotWriteback: create,
  markHubSpotWritebackApplied,
  markHubSpotWritebackRejected,
  updateHubSpotWritebackFeedbackNote,
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

describe("HubSpot writebacks service", () => {
  beforeEach(() => {
    create.mockReset();
    create.mockResolvedValue({});
    findHubSpotWritebackForApproval.mockReset();
    markHubSpotWritebackApplied.mockReset();
    markHubSpotWritebackRejected.mockReset();
    updateHubSpotWritebackFeedbackNote.mockReset();
    getContact.mockReset();
    updateContactProperties.mockReset();
    createContactNote.mockReset();
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
      hubSpotWorkflowRunId: "workflow-run-1",
      plan: {
        kind: "writeback",
        fieldUpdates: [{ name: "pd_urgency", value: "high" }],
        note: "Hot lead from Zillow.",
      },
    });
  });

  test("approves a pending HubSpot Writeback by applying the plan and marking it applied", async () => {
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
      properties: {
        pd_urgency: "normal",
      },
    });
    updateContactProperties.mockResolvedValue(undefined);

    const { approveHubSpotWriteback } = await importWithRequiredEnv(() =>
      import("./index"),
    );

    const result = await approveHubSpotWriteback("writeback-1");

    expect(result).toEqual({ ok: true });
    expect(updateContactProperties).toHaveBeenCalledWith("contact-123", {
      pd_urgency: "high",
    });
    expect(markHubSpotWritebackApplied).toHaveBeenCalledWith({
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

  test("leaves a pending HubSpot Writeback unchanged when HubSpot returns a transient error", async () => {
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
      properties: {
        pd_urgency: "normal",
      },
    });
    updateContactProperties.mockRejectedValue(
      new Error("HubSpot request failed with status 503"),
    );

    const { approveHubSpotWriteback } = await importWithRequiredEnv(() =>
      import("./index"),
    );

    const result = await approveHubSpotWriteback("writeback-1");

    expect(result).toEqual({
      ok: false,
      message: "HubSpot could not apply this writeback. Please try again.",
    });
    expect(markHubSpotWritebackApplied).not.toHaveBeenCalled();
  });

  test("rejects a pending HubSpot Writeback without calling HubSpot", async () => {
    findHubSpotWritebackForApproval.mockResolvedValue({
      id: "writeback-1",
      state: "PENDING",
      contactId: "contact-123",
      plan: {
        kind: "writeback",
        fieldUpdates: [{ name: "pd_urgency", value: "high" }],
        note: "Hot lead from Zillow.",
      },
    });

    const { rejectHubSpotWriteback } = await importWithRequiredEnv(() =>
      import("./index"),
    );

    const result = await rejectHubSpotWriteback("writeback-1");

    expect(result).toEqual({ ok: true });
    expect(markHubSpotWritebackRejected).toHaveBeenCalledWith({
      id: "writeback-1",
      reviewDeskFeedbackNote: undefined,
    });
    expect(getContact).not.toHaveBeenCalled();
    expect(updateContactProperties).not.toHaveBeenCalled();
    expect(createContactNote).not.toHaveBeenCalled();
  });

  test("attaches, edits, and clears Review Desk feedback notes", async () => {
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
      properties: {
        pd_urgency: "normal",
      },
    });
    updateContactProperties.mockResolvedValue(undefined);

    const {
      approveHubSpotWriteback,
      updateReviewDeskFeedbackNote,
    } = await importWithRequiredEnv(() => import("./index"));

    await approveHubSpotWriteback("writeback-1", {
      reviewDeskFeedbackNote: "Operator verified the phone call.",
    });
    await updateReviewDeskFeedbackNote(
      "writeback-1",
      "Operator verified the phone call and CRM owner.",
    );
    await updateReviewDeskFeedbackNote("writeback-1", null);

    expect(markHubSpotWritebackApplied).toHaveBeenCalledWith({
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
      reviewDeskFeedbackNote: "Operator verified the phone call.",
    });
    expect(updateHubSpotWritebackFeedbackNote).toHaveBeenNthCalledWith(1, {
      id: "writeback-1",
      reviewDeskFeedbackNote:
        "Operator verified the phone call and CRM owner.",
    });
    expect(updateHubSpotWritebackFeedbackNote).toHaveBeenNthCalledWith(2, {
      id: "writeback-1",
      reviewDeskFeedbackNote: null,
    });
  });
});
