import { beforeEach, describe, expect, test, vi } from "vitest";

import { importWithRequiredEnv } from "@/tests/env";

const create = vi.fn();
const findHubSpotWritebackForApproval = vi.fn();
const getHubSpotWritebackAutoModeEnabled = vi.fn();
const getOperatorDashboardCountsRaw = vi.fn();
const markHubSpotWritebackApplied = vi.fn();
const markHubSpotWritebackRejected = vi.fn();
const updateHubSpotWritebackFeedbackNote = vi.fn();
const markHubSpotWritebackAutoApplied = vi.fn();
const setHubSpotWritebackAutoModeEnabled = vi.fn();
const getContact = vi.fn();
const updateContactProperties = vi.fn();
const createContactNote = vi.fn();

vi.mock("./internal/queries", () => ({
  findHubSpotWritebackForApproval,
  getHubSpotWritebackAutoModeEnabled,
  getOperatorDashboardCountsRaw,
}));

vi.mock("./internal/mutations", () => ({
  createPendingHubSpotWriteback: create,
  markHubSpotWritebackApplied,
  markHubSpotWritebackRejected,
  updateHubSpotWritebackFeedbackNote,
  markHubSpotWritebackAutoApplied,
  setHubSpotWritebackAutoModeEnabled,
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
    getHubSpotWritebackAutoModeEnabled.mockReset();
    getHubSpotWritebackAutoModeEnabled.mockResolvedValue(false);
    getOperatorDashboardCountsRaw.mockReset();
    markHubSpotWritebackApplied.mockReset();
    markHubSpotWritebackApplied.mockResolvedValue(true);
    markHubSpotWritebackRejected.mockReset();
    markHubSpotWritebackRejected.mockResolvedValue(true);
    updateHubSpotWritebackFeedbackNote.mockReset();
    markHubSpotWritebackAutoApplied.mockReset();
    markHubSpotWritebackAutoApplied.mockResolvedValue(true);
    setHubSpotWritebackAutoModeEnabled.mockReset();
    setHubSpotWritebackAutoModeEnabled.mockResolvedValue(true);
    getContact.mockReset();
    updateContactProperties.mockReset();
    createContactNote.mockReset();
  });

  test("records a proposed HubSpot Writeback as pending when Auto-Mode is off", async () => {
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
    expect(getHubSpotWritebackAutoModeEnabled).toHaveBeenCalledTimes(1);
    expect(updateContactProperties).not.toHaveBeenCalled();
    expect(createContactNote).not.toHaveBeenCalled();
    expect(markHubSpotWritebackAutoApplied).not.toHaveBeenCalled();
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
      reviewDeskFeedbackNote: undefined,
    });
  });

  test("reads and writes the global Auto-Mode setting", async () => {
    getHubSpotWritebackAutoModeEnabled.mockResolvedValue(false);

    const {
      getHubSpotWritebackAutoMode,
      setHubSpotWritebackAutoMode,
    } = await importWithRequiredEnv(() => import("./index"));

    await expect(getHubSpotWritebackAutoMode()).resolves.toEqual({
      enabled: false,
    });
    await expect(
      setHubSpotWritebackAutoMode({ enabled: true }),
    ).resolves.toEqual({ enabled: true });

    expect(setHubSpotWritebackAutoModeEnabled).toHaveBeenCalledWith(true);
    expect(create).not.toHaveBeenCalled();
    expect(updateContactProperties).not.toHaveBeenCalled();
    expect(markHubSpotWritebackAutoApplied).not.toHaveBeenCalled();
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

  test("computes operator dashboard counts with today/30-day windows and a defined approval rate", async () => {
    getOperatorDashboardCountsRaw.mockResolvedValue({
      handledToday: 14,
      autoApprovedToday: 12,
      awaitingReviewToday: 2,
      decided30dApproved: 47,
      decided30dRejected: 3,
    });

    const fixedNow = new Date("2026-05-14T10:30:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);

    try {
      const { getOperatorDashboardCounts } = await importWithRequiredEnv(() =>
        import("./index"),
      );

      const counts = await getOperatorDashboardCounts();

      expect(counts).toEqual({
        handledToday: 14,
        autoApprovedToday: 12,
        awaitingReviewToday: 2,
        approvalRate30Days: 47 / 50,
      });

      expect(getOperatorDashboardCountsRaw).toHaveBeenCalledTimes(1);
      const { todayStart, thirtyDaysAgo } =
        getOperatorDashboardCountsRaw.mock.calls[0][0];
      const expectedTodayStart = new Date(fixedNow);
      expectedTodayStart.setHours(0, 0, 0, 0);
      const expectedThirtyDaysAgo = new Date(expectedTodayStart);
      expectedThirtyDaysAgo.setDate(expectedThirtyDaysAgo.getDate() - 30);
      expect(todayStart.getTime()).toBe(expectedTodayStart.getTime());
      expect(thirtyDaysAgo.getTime()).toBe(expectedThirtyDaysAgo.getTime());
    } finally {
      vi.useRealTimers();
    }
  });

  test("returns a null approval rate when no writebacks have been decided in the last 30 days", async () => {
    getOperatorDashboardCountsRaw.mockResolvedValue({
      handledToday: 0,
      autoApprovedToday: 0,
      awaitingReviewToday: 0,
      decided30dApproved: 0,
      decided30dRejected: 0,
    });

    const { getOperatorDashboardCounts } = await importWithRequiredEnv(() =>
      import("./index"),
    );

    const counts = await getOperatorDashboardCounts();

    expect(counts.approvalRate30Days).toBeNull();
  });

  test("excludes pending writebacks from the approval-rate computation", async () => {
    getOperatorDashboardCountsRaw.mockResolvedValue({
      handledToday: 5,
      autoApprovedToday: 0,
      awaitingReviewToday: 5,
      decided30dApproved: 8,
      decided30dRejected: 2,
    });

    const { getOperatorDashboardCounts } = await importWithRequiredEnv(() =>
      import("./index"),
    );

    const counts = await getOperatorDashboardCounts();

    expect(counts.awaitingReviewToday).toBe(5);
    expect(counts.approvalRate30Days).toBe(8 / 10);
  });

  test("reports approval as stale when another path already decided the HubSpot Writeback", async () => {
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
    markHubSpotWritebackApplied.mockResolvedValue(false);

    const { approveHubSpotWriteback } = await importWithRequiredEnv(() =>
      import("./index"),
    );

    const result = await approveHubSpotWriteback("writeback-1");

    expect(result).toEqual({
      ok: false,
      message: "Only pending HubSpot Writebacks can be approved.",
    });
  });
});
