import { beforeEach, describe, expect, test, vi } from "vitest";

import { importWithRequiredEnv } from "@/tests/env";

const create = vi.fn();
const findHubSpotWritebackForApproval = vi.fn();
const getHubSpotWritebackAutoModeEnabled = vi.fn();
const markHubSpotWritebackApplied = vi.fn();
const markHubSpotWritebackAutoApplied = vi.fn();
const setHubSpotWritebackAutoModeEnabled = vi.fn();
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
  getHubSpotWritebackAutoModeEnabled,
}));

vi.mock("./internal/mutations", () => ({
  createPendingHubSpotWriteback: create,
  markHubSpotWritebackApplied,
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
    markHubSpotWritebackApplied.mockReset();
    markHubSpotWritebackApplied.mockResolvedValue(true);
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
