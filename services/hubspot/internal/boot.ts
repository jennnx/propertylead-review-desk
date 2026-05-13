import {
  verifyWritableHubSpotPropertyCatalog,
  type VerifyWritableHubSpotPropertyCatalogResult,
} from "./verify";

export type VerifyWritableHubSpotPropertyCatalogOnBootInput = {
  processName: "next" | "worker";
  verify?: () => Promise<VerifyWritableHubSpotPropertyCatalogResult>;
  log?: (message: string) => void;
  errorLog?: (message: string) => void;
  exit?: (code: number) => never;
  skip?: boolean;
};

const defaultExit = (code: number): never => {
  process.exit(code);
};

export async function verifyWritableHubSpotPropertyCatalogOnBoot({
  processName,
  verify = verifyWritableHubSpotPropertyCatalog,
  log = (message) => console.log(message),
  errorLog = (message) => console.error(message),
  exit = defaultExit,
  skip = process.env.NODE_ENV === "test",
}: VerifyWritableHubSpotPropertyCatalogOnBootInput): Promise<void> {
  if (skip) return;

  const result = await verify();

  if (result.failures.length > 0) {
    errorLog(
      `hubspot[${processName}]: Writable HubSpot Property Catalog verification failed`,
    );
    for (const failure of result.failures) {
      errorLog(
        `hubspot[${processName}]: ${failure.name}: ${failure.reason}`,
      );
    }
    exit(1);
    return;
  }

  log(
    `hubspot[${processName}]: Writable HubSpot Property Catalog verified (${result.verified.length} entries)`,
  );
}
