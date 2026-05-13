export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  await import("./lib/env");
  const { verifyWritableHubSpotPropertyCatalogOnBoot } = await import(
    "./services/hubspot"
  );
  await verifyWritableHubSpotPropertyCatalogOnBoot({ processName: "next" });
}
