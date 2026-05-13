export async function register() {
  await import("./lib/env");
  const { verifyWritableHubSpotPropertyCatalogOnBoot } = await import(
    "./services/hubspot"
  );
  await verifyWritableHubSpotPropertyCatalogOnBoot({ processName: "next" });
}
