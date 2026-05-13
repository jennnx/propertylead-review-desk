"use server";

import { revalidatePath } from "next/cache";

import { approveHubSpotWriteback } from "@/services/hubspot-writebacks";

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
