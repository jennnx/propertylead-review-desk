import { Analytics01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

export default function UsagePage() {
  return (
    <main className="min-h-svh bg-canvas text-foreground">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-10 lg:px-10">
        <header className="flex flex-col gap-1.5">
          <h1 className="text-[28px] font-semibold leading-tight tracking-tight">
            Usage
          </h1>
          <p className="text-sm text-muted-foreground">
            Spend, volume, and performance for every AI call PropertyLead makes.
          </p>
        </header>

        <div className="flex min-h-56 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-elevated/40 px-6 py-10 text-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground ring-1 ring-border">
            <HugeiconsIcon icon={Analytics01Icon} strokeWidth={1.75} />
          </span>
          <p className="text-sm font-medium tracking-tight">
            Usage data coming soon
          </p>
          <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
            Once telemetry is wired through the AI providers, this page will
            show spend, tokens, latency, and a per-call drilldown.
          </p>
        </div>
      </div>
    </main>
  );
}
