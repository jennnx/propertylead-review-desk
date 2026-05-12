import {
  HUBSPOT_PROPERTYDESK_PROPERTY_GROUP_NAME,
  WRITABLE_HUBSPOT_PROPERTY_CATALOG,
  isWritableHubSpotPropertyName,
  type WritableHubSpotPropertyCatalogEntry,
} from "./catalog";
import { hubSpot, type HubSpotContactProperty } from "./client";
import type { CreateHubSpotContactPropertyInput } from "./client";

export type HubSpotPropertyCatalogSetupClient = {
  getContactProperty: (name: string) => Promise<HubSpotContactProperty | null>;
  createContactProperty: (
    input: CreateHubSpotContactPropertyInput,
  ) => Promise<unknown>;
};

export type HubSpotPropertyCatalogSetupFailure = {
  name: string;
  reason:
    | "incompatible_property_metadata"
    | "missing_verification_only_property"
    | "not_in_static_catalog";
};

export type SetupWritableHubSpotPropertyCatalogInput = {
  hubSpot?: HubSpotPropertyCatalogSetupClient;
  catalog?: readonly WritableHubSpotPropertyCatalogEntry[];
};

export type SetupWritableHubSpotPropertyCatalogResult = {
  created: string[];
  verified: string[];
  failures: HubSpotPropertyCatalogSetupFailure[];
};

export async function setupWritableHubSpotPropertyCatalog({
  hubSpot: setupClient = hubSpot,
  catalog = WRITABLE_HUBSPOT_PROPERTY_CATALOG,
}: SetupWritableHubSpotPropertyCatalogInput = {}): Promise<SetupWritableHubSpotPropertyCatalogResult> {
  const result: SetupWritableHubSpotPropertyCatalogResult = {
    created: [],
    verified: [],
    failures: [],
  };

  for (const entry of catalog) {
    if (!isWritableHubSpotPropertyName(entry.name)) {
      result.failures.push({
        name: entry.name,
        reason: "not_in_static_catalog",
      });
      continue;
    }

    const existingProperty = await setupClient.getContactProperty(entry.name);

    if (!existingProperty) {
      if (entry.setup === "verify") {
        result.failures.push({
          name: entry.name,
          reason: "missing_verification_only_property",
        });
        continue;
      }

      await setupClient.createContactProperty(toCreateContactPropertyInput(entry));
      result.created.push(entry.name);
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

function toCreateContactPropertyInput(
  entry: WritableHubSpotPropertyCatalogEntry,
): CreateHubSpotContactPropertyInput {
  return {
    name: entry.name,
    label: entry.label,
    groupName: HUBSPOT_PROPERTYDESK_PROPERTY_GROUP_NAME,
    type: entry.type,
    fieldType: entry.fieldType,
    options: entry.options?.map((value) => ({
      label: value,
      value,
    })),
  };
}

function isCompatibleContactProperty(
  expected: WritableHubSpotPropertyCatalogEntry,
  actual: HubSpotContactProperty,
): boolean {
  if (actual.type !== expected.type) return false;
  if (actual.fieldType !== expected.fieldType) return false;

  if (expected.setup === "create" && expected.options) {
    const actualOptions = new Set(
      actual.options?.map((option) => option.value) ?? [],
    );
    return expected.options.every((value) => actualOptions.has(value));
  }

  return true;
}
