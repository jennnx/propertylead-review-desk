"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import type { UsageTimeWindowPreset } from "@/services/llm-telemetry";
import { cn } from "@/lib/utils";

export function TimeWindowSelector({
  presets,
  value,
}: {
  presets: ReadonlyArray<{ value: UsageTimeWindowPreset; label: string }>;
  value: UsageTimeWindowPreset;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  function setWindow(next: UsageTimeWindowPreset) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "30d") {
      params.delete("window");
    } else {
      params.set("window", next);
    }
    params.delete("page");
    const query = params.toString();
    startTransition(() => {
      router.push(query ? `${pathname}?${query}` : pathname);
    });
  }

  return (
    <div
      role="radiogroup"
      aria-label="Time window"
      className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-border bg-elevated/40 p-1 text-xs"
    >
      {presets.map((preset) => {
        const isActive = preset.value === value;
        return (
          <button
            type="button"
            key={preset.value}
            role="radio"
            aria-checked={isActive}
            onClick={() => setWindow(preset.value)}
            className={cn(
              "rounded-md px-3 py-1.5 font-medium transition-colors",
              isActive
                ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {preset.label}
          </button>
        );
      })}
    </div>
  );
}
