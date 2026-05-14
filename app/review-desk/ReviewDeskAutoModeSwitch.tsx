"use client";

import { useState, useTransition } from "react";

import { Switch } from "@/components/ui/switch";

import { setHubSpotWritebackAutoModeAction } from "./actions";

export function ReviewDeskAutoModeSwitch({ enabled }: { enabled: boolean }) {
  const [checked, setChecked] = useState(enabled);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleCheckedChange(next: boolean) {
    const previous = checked;
    setChecked(next);
    setMessage(null);

    startTransition(async () => {
      const result = await setHubSpotWritebackAutoModeAction(next);
      if (result.ok) {
        setChecked(result.enabled);
        return;
      }

      setChecked(previous);
      setMessage(result.message);
    });
  }

  return (
    <div className="flex items-center gap-3 rounded-md border border-border px-3 py-2">
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-medium">Auto-Mode</p>
        <p className="text-xs text-muted-foreground">
          {checked ? "New plans apply automatically." : "New plans wait for review."}
        </p>
        {message ? <p className="text-xs text-destructive">{message}</p> : null}
      </div>
      <Switch
        aria-label="Auto-Mode"
        checked={checked}
        disabled={isPending}
        onCheckedChange={handleCheckedChange}
      />
    </div>
  );
}
