import { verifyWritableHubSpotPropertyCatalog } from "./verify";

export type VerifyWritableHubSpotPropertyCatalogOnBootInput = {
  processName: "next" | "worker";
};

export async function verifyWritableHubSpotPropertyCatalogOnBoot({
  processName,
}: VerifyWritableHubSpotPropertyCatalogOnBootInput): Promise<void> {
  const result = await verifyWritableHubSpotPropertyCatalog();

  if (result.failures.length > 0) {
    console.error(
      `hubspot[${processName}]: Writable HubSpot Property Catalog verification failed`,
    );
    for (const failure of result.failures) {
      console.error(
        `hubspot[${processName}]: ${failure.name}: ${failure.reason}`,
      );
    }
    process.exit(1);
  } else {
    console.log(
      `hubspot[${processName}]: Writable HubSpot Property Catalog verified (${result.verified.length} entries)`,
    );
  }
}
