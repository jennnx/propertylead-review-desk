"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useId, useTransition } from "react";

import { Switch } from "@/components/ui/switch";
import type { UsageSourceFilter } from "@/services/llm-telemetry";

export function UsageSourceToggle({ value }: { value: UsageSourceFilter }) {
  const id = useId();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const includesEval = value === "all";

  function setIncludesEval(checked: boolean) {
    const params = new URLSearchParams(searchParams.toString());
    if (checked) {
      params.set("source", "all");
    } else {
      params.delete("source");
    }
    params.delete("page");
    const query = params.toString();
    startTransition(() => {
      router.push(query ? `${pathname}?${query}` : pathname);
    });
  }

  return (
    <label
      htmlFor={id}
      className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-border bg-elevated/30 px-3 py-1.5 text-xs text-muted-foreground"
    >
      <Switch
        id={id}
        size="sm"
        checked={includesEval}
        onCheckedChange={setIncludesEval}
        aria-label="Include eval traffic"
      />
      <span className="font-medium">Include eval</span>
    </label>
  );
}
