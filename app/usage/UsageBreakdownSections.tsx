import { Badge } from "@/components/ui/badge";
import type { UsageBreakdown } from "@/services/llm-telemetry";

export function UsageBreakdownSections({
  breakdown,
  windowLabel,
}: {
  breakdown: UsageBreakdown;
  windowLabel: string;
}) {
  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h2 className="text-[17px] font-semibold tracking-tight">
          Token & latency breakdown
        </h2>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Production calls in {windowLabel.toLowerCase()}, grouped by provider
          and model alias.
        </p>
      </header>

      {breakdown.providers.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {breakdown.providers.map((provider) => (
            <ProviderTokenPanel key={provider.provider} provider={provider} />
          ))}
        </div>
      ) : (
        <div className="flex min-h-32 items-center justify-center rounded-xl border border-dashed border-border bg-elevated/40 px-6 py-8 text-center">
          <p className="text-sm font-medium text-muted-foreground">
            No token or latency data in this window
          </p>
        </div>
      )}

      <ModelBreakdownTable models={breakdown.models} />
    </section>
  );
}

function ProviderTokenPanel({
  provider,
}: {
  provider: UsageBreakdown["providers"][number];
}) {
  const isAnthropic = provider.provider === "anthropic";

  return (
    <article className="rounded-xl border border-border bg-elevated/70 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold tracking-tight">
              {formatProvider(provider.provider)}
            </h3>
            <Badge variant="outline">{provider.callCount} calls</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {formatNumber(getProviderTotalTokens(provider))} total tokens
          </p>
        </div>
        {isAnthropic ? (
          <div className="text-right">
            <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
              Cache hit
            </p>
            <p data-nums="tabular" className="text-lg font-semibold">
              {formatPercent(provider.cacheHitRatio ?? 0)}
            </p>
          </div>
        ) : null}
      </div>

      {isAnthropic ? (
        <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <TokenMetric
            label="Input avg"
            value={provider.averageInputTokens}
          />
          <TokenMetric
            label="Output avg"
            value={provider.averageOutputTokens}
          />
          <TokenMetric
            label="Cache read avg"
            value={provider.averageCacheReadTokens}
          />
          <TokenMetric
            label="Cache write avg"
            value={provider.averageCacheCreationTokens}
          />
        </dl>
      ) : (
        <dl className="mt-5 grid grid-cols-2 gap-3">
          <TokenMetric
            label="Total avg"
            value={provider.averageTotalTokens}
          />
          <TokenMetric label="Total" value={provider.totalTokens} />
        </dl>
      )}
    </article>
  );
}

function TokenMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-muted/45 px-3 py-2">
      <dt className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </dt>
      <dd data-nums="tabular" className="mt-1 text-sm font-semibold">
        {formatNumber(Math.round(value))}
      </dd>
    </div>
  );
}

function ModelBreakdownTable({
  models,
}: {
  models: UsageBreakdown["models"];
}) {
  if (models.length === 0) {
    return (
      <div className="flex min-h-28 items-center justify-center rounded-xl border border-dashed border-border bg-elevated/40 px-6 py-8 text-center">
        <p className="text-sm font-medium text-muted-foreground">
          No model rows in this window
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-elevated">
      <div className="flex flex-col gap-1 border-b border-border px-5 py-4">
        <h3 className="text-sm font-semibold tracking-tight">
          Per-model breakdown
        </h3>
        <p className="text-xs text-muted-foreground">
          Sorted by total cost, then call volume.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-left text-xs">
          <thead className="bg-muted/40 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            <tr>
              <th className="px-5 py-3 font-medium">Provider</th>
              <th className="px-5 py-3 font-medium">Model alias</th>
              <th className="px-5 py-3 text-right font-medium">Calls</th>
              <th className="px-5 py-3 text-right font-medium">Tokens</th>
              <th className="px-5 py-3 text-right font-medium">Cost</th>
              <th className="px-5 py-3 text-right font-medium">Avg ms</th>
              <th className="px-5 py-3 text-right font-medium">p50 ms</th>
              <th className="px-5 py-3 text-right font-medium">p95 ms</th>
            </tr>
          </thead>
          <tbody>
            {models.map((model) => (
              <tr
                key={`${model.provider}:${model.modelAlias}`}
                className="border-t border-border first:border-t-0"
              >
                <td className="px-5 py-3">
                  <Badge variant="secondary">
                    {formatProvider(model.provider)}
                  </Badge>
                </td>
                <td className="px-5 py-3 font-medium">{model.modelAlias}</td>
                <td data-nums="tabular" className="px-5 py-3 text-right">
                  {formatNumber(model.callCount)}
                </td>
                <td data-nums="tabular" className="px-5 py-3 text-right">
                  <TokenSummary model={model} />
                </td>
                <td data-nums="tabular" className="px-5 py-3 text-right">
                  {model.totalCostUsd === null
                    ? "-"
                    : formatUsd(model.totalCostUsd)}
                </td>
                <td data-nums="tabular" className="px-5 py-3 text-right">
                  {formatNumber(Math.round(model.averageLatencyMs))}
                </td>
                <td data-nums="tabular" className="px-5 py-3 text-right">
                  {formatNumber(Math.round(model.p50LatencyMs))}
                </td>
                <td data-nums="tabular" className="px-5 py-3 text-right">
                  {formatNumber(Math.round(model.p95LatencyMs))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TokenSummary({
  model,
}: {
  model: UsageBreakdown["models"][number];
}) {
  if (model.provider === "voyage") {
    return <>{formatNumber(model.totalTokens)} total</>;
  }

  return (
    <>
      {formatNumber(model.totalInputTokens)} in /{" "}
      {formatNumber(model.totalOutputTokens)} out /{" "}
      {formatNumber(model.totalCacheReadTokens)} cache read /{" "}
      {formatNumber(model.totalCacheCreationTokens)} cache write
    </>
  );
}

function getProviderTotalTokens(
  provider: UsageBreakdown["providers"][number],
): number {
  return provider.provider === "voyage"
    ? provider.totalTokens
    : provider.totalInputTokens +
        provider.totalOutputTokens +
        provider.totalCacheCreationTokens +
        provider.totalCacheReadTokens;
}

function formatProvider(provider: "anthropic" | "voyage"): string {
  return provider === "anthropic" ? "Anthropic" : "Voyage";
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatPercent(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatUsd(value: number): string {
  const fractionDigits = value < 0.01 ? 6 : value < 1 ? 4 : 2;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}
