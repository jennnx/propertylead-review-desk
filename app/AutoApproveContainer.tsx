"use client";

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
        "flex flex-col gap-2 rounded-md border bg-sidebar p-3",
        checked ? "border-sidebar-border" : "border-sidebar-border/60",
      )}
    >
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className={cn(
            "size-1.5 rounded-full",
            checked ? "bg-emerald-500" : "bg-sidebar-foreground/30",
          )}
        />
        <p className="text-sm font-medium">Auto-approve</p>
        <Switch
          aria-label="Auto-approve"
          className="ml-auto"
          checked={checked}
          disabled={isPending}
          onCheckedChange={requestChange}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {checked
          ? "AI applies suggestions automatically"
          : "Suggestions wait for your review"}
      </p>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}

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
