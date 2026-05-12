import { WRITABLE_HUBSPOT_PROPERTY_CATALOG } from "@/services/hubspot";

export const ENRICHMENT_INPUT_CONTACT_PROPERTY_NAMES: readonly string[] = [
  ...WRITABLE_HUBSPOT_PROPERTY_CATALOG.map((entry) => entry.name),
  "hs_analytics_source_data_1",
  "hs_analytics_source_data_2",
  "hs_latest_source_data_1",
  "hs_latest_source_data_2",
];

export function pickEnrichmentContactProperties(
  properties: Record<string, string | null>,
): Record<string, string | null> {
  const picked: Record<string, string | null> = {};

  for (const name of ENRICHMENT_INPUT_CONTACT_PROPERTY_NAMES) {
    picked[name] = properties[name] ?? null;
  }

  return picked;
}
