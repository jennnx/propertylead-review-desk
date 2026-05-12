import {
  WRITABLE_HUBSPOT_PROPERTY_CATALOG,
  type WritableHubSpotPropertyCatalogEntry,
} from "./catalog";
import { hubSpot, type HubSpotContactProperty } from "./client";

export type HubSpotPropertyCatalogVerifyClient = {
  getContactProperty: (name: string) => Promise<HubSpotContactProperty | null>;
};

export type HubSpotPropertyCatalogVerifyFailure = {
  name: string;
  reason: "missing" | "incompatible_property_metadata";
};

export type VerifyWritableHubSpotPropertyCatalogInput = {
  hubSpot?: HubSpotPropertyCatalogVerifyClient;
  catalog?: readonly WritableHubSpotPropertyCatalogEntry[];
};

export type VerifyWritableHubSpotPropertyCatalogResult = {
  verified: string[];
  failures: HubSpotPropertyCatalogVerifyFailure[];
};

export async function verifyWritableHubSpotPropertyCatalog({
  hubSpot: verifyClient = hubSpot,
  catalog = WRITABLE_HUBSPOT_PROPERTY_CATALOG,
}: VerifyWritableHubSpotPropertyCatalogInput = {}): Promise<VerifyWritableHubSpotPropertyCatalogResult> {
  const result: VerifyWritableHubSpotPropertyCatalogResult = {
    verified: [],
    failures: [],
  };

  for (const entry of catalog) {
    const existingProperty = await verifyClient.getContactProperty(entry.name);

    if (!existingProperty) {
      result.failures.push({ name: entry.name, reason: "missing" });
      continue;
    }

    if (!isCompatibleContactProperty(entry, existingProperty)) {
      result.failures.push({
        name: entry.name,
        reason: "incompatible_property_metadata",
      });
      continue;
    }

    result.verified.push(entry.name);
  }

  return result;
}

function isCompatibleContactProperty(
  expected: WritableHubSpotPropertyCatalogEntry,
  actual: HubSpotContactProperty,
): boolean {
  if (actual.type !== expected.type) return false;
  if (actual.fieldType !== expected.fieldType) return false;

  if (expected.options) {
    const actualOptions = new Set(
      actual.options?.map((option) => option.value) ?? [],
    );
    return expected.options.every((value) => actualOptions.has(value));
  }

  return true;
}
