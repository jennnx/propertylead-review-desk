import {
  WRITABLE_HUBSPOT_PROPERTY_CATALOG,
  type WritableHubSpotPropertyCatalogEntry,
} from "@/services/hubspot";

const CONTEXT_ONLY_FIELD_NAMES = new Set([
  "hs_analytics_source",
  "hs_latest_source",
]);

export function isClaudeUpdateableHubSpotPropertyEntry(
  entry: WritableHubSpotPropertyCatalogEntry,
): boolean {
  return (
    entry.controlledBy !== "system" &&
    !CONTEXT_ONLY_FIELD_NAMES.has(entry.name)
  );
}

export function isClaudeUpdateableHubSpotPropertyName(name: string): boolean {
  const entry = WRITABLE_HUBSPOT_PROPERTY_CATALOG.find(
    (catalogEntry) => catalogEntry.name === name,
  );
  return entry ? isClaudeUpdateableHubSpotPropertyEntry(entry) : false;
}
