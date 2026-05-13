"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  approveHubSpotWriteback,
  setHubSpotWritebackAutoMode,
} from "@/services/hubspot-writebacks";

const autoModeEnabledSchema = z.boolean();

export type ReviewDeskApproveActionState = {
  status: "idle" | "error";
  message: string | null;
};

export async function approveHubSpotWritebackAction(
  _state: ReviewDeskApproveActionState,
  formData: FormData,
): Promise<ReviewDeskApproveActionState> {
  const id = formData.get("hubSpotWritebackId");

  if (typeof id !== "string" || id.length === 0) {
    return {
      status: "error",
      message: "Missing HubSpot Writeback id.",
    };
  }

  const result = await approveHubSpotWriteback(id);
  if (!result.ok) {
    return {
      status: "error",
      message: result.message,
    };
  }

  revalidatePath("/review-desk");
  revalidatePath(`/review-desk/${id}`);
  return { status: "idle", message: null };
}

export type ReviewDeskAutoModeActionResult =
  | { ok: true; enabled: boolean }
  | { ok: false; message: string };

export async function setHubSpotWritebackAutoModeAction(
  enabled: unknown,
): Promise<ReviewDeskAutoModeActionResult> {
  const parsed = autoModeEnabledSchema.safeParse(enabled);
  if (!parsed.success) {
    return { ok: false, message: "Invalid Auto-Mode value." };
  }

  try {
    const setting = await setHubSpotWritebackAutoMode({
      enabled: parsed.data,
    });
    revalidatePath("/review-desk");
    return { ok: true, enabled: setting.enabled };
  } catch (error) {
    console.error("Failed to update HubSpot Writeback Auto-Mode.", {
      error,
    });
    return {
      ok: false,
      message: "Auto-Mode could not be updated. Please try again.",
    };
  }
}
