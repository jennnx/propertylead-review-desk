"use client";

import { MagicWand01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

import { setHubSpotWritebackAutoModeAction } from "./review-desk/actions";

export function AutoApproveContainer({ enabled }: { enabled: boolean }) {
  const [checked, setChecked] = useState(enabled);
  const [pendingValue, setPendingValue] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function requestChange(next: boolean) {
    setError(null);
    setPendingValue(next);
  }

  function cancelChange() {
    setPendingValue(null);
  }

  function handleDialogOpenChange(open: boolean) {
    if (!open) cancelChange();
  }

  function confirmChange() {
    if (pendingValue === null) return;
    const next = pendingValue;
    setPendingValue(null);
    startTransition(async () => {
      const result = await setHubSpotWritebackAutoModeAction(next);
      if (result.ok) {
        setChecked(result.enabled);
        return;
      }
      setError(result.message);
    });
  }

  const dialogOpen = pendingValue !== null;
  const turningOn = pendingValue === true;

  return (
    <div
      data-state={checked ? "on" : "off"}
      className={cn(
        "flex flex-col gap-2 rounded-lg border bg-elevated p-3 transition-colors",
        checked
          ? "border-sidebar-border shadow-[0_1px_0_0_oklch(0_0_0/0.03)]"
          : "border-sidebar-border/70",
      )}
    >
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className={cn(
            "flex size-6 items-center justify-center rounded-md ring-1",
            checked
              ? "bg-emerald-50 text-emerald-700 ring-emerald-200/80 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30"
              : "bg-muted text-muted-foreground ring-border",
          )}
        >
          <HugeiconsIcon
            icon={MagicWand01Icon}
            strokeWidth={2}
            className="size-3.5"
          />
        </span>
        <div className="flex flex-col leading-tight">
          <p className="text-[12px] font-semibold tracking-tight">
            Auto-approve
          </p>
          <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
            {checked ? "Active" : "Off"}
          </p>
        </div>
        <Switch
          aria-label="Auto-approve"
          className="ml-auto"
          checked={checked}
          disabled={isPending}
          onCheckedChange={requestChange}
        />
      </div>
      <p className="text-[11px] leading-snug text-muted-foreground">
        {checked
          ? "AI applies suggestions immediately."
          : "Suggestions wait for your review."}
      </p>
      {error ? (
        <p className="text-[11px] text-destructive">{error}</p>
      ) : null}

      <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {turningOn ? "Turn Auto-approve on?" : "Turn Auto-approve off?"}
            </DialogTitle>
            <DialogDescription>
              {turningOn
                ? "New AI suggestions will be applied to HubSpot immediately, without your review. You can turn this off any time."
                : "New AI suggestions will wait for your review before being applied to HubSpot. You can turn this on again any time."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={cancelChange}>
              Cancel
            </Button>
            <Button onClick={confirmChange}>
              {turningOn ? "Turn on" : "Turn off"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
