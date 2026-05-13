import { describe, expect, test, vi } from "vitest";

import { importWithRequiredEnv } from "@/tests/env";

describe("verifyWritableHubSpotPropertyCatalogOnBoot", () => {
  test("logs success and does not exit when verification has no failures", async () => {
    const verify = vi
      .fn()
      .mockResolvedValue({ verified: ["email", "pd_urgency"], failures: [] });
    const log = vi.fn();
    const errorLog = vi.fn();
    const exit = vi.fn() as unknown as (code: number) => never;

    const { verifyWritableHubSpotPropertyCatalogOnBoot } =
      await importWithRequiredEnv(() => import("./boot"));

    await verifyWritableHubSpotPropertyCatalogOnBoot({
      processName: "next",
      verify,
      log,
      errorLog,
      exit,
      skip: false,
    });

    expect(verify).toHaveBeenCalledTimes(1);
    expect(exit).not.toHaveBeenCalled();
    expect(errorLog).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      "hubspot[next]: Writable HubSpot Property Catalog verified (2 entries)",
    );
  });

  test("logs each failure and exits non-zero when verification reports failures", async () => {
    const verify = vi.fn().mockResolvedValue({
      verified: [],
      failures: [
        { name: "pd_urgency", reason: "missing" },
        { name: "pd_buy_readiness", reason: "incompatible_property_metadata" },
      ],
    });
    const log = vi.fn();
    const errorLog = vi.fn();
    const exit = vi.fn() as unknown as (code: number) => never;

    const { verifyWritableHubSpotPropertyCatalogOnBoot } =
      await importWithRequiredEnv(() => import("./boot"));

    await verifyWritableHubSpotPropertyCatalogOnBoot({
      processName: "worker",
      verify,
      log,
      errorLog,
      exit,
      skip: false,
    });

    expect(verify).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(1);
    expect(log).not.toHaveBeenCalled();
    expect(errorLog.mock.calls.map((call) => call[0])).toEqual([
      "hubspot[worker]: Writable HubSpot Property Catalog verification failed",
      "hubspot[worker]: pd_urgency: missing",
      "hubspot[worker]: pd_buy_readiness: incompatible_property_metadata",
    ]);
  });

  test("skips verification entirely when skip is true", async () => {
    const verify = vi.fn();
    const exit = vi.fn() as unknown as (code: number) => never;

    const { verifyWritableHubSpotPropertyCatalogOnBoot } =
      await importWithRequiredEnv(() => import("./boot"));

    await verifyWritableHubSpotPropertyCatalogOnBoot({
      processName: "next",
      verify,
      exit,
      skip: true,
    });

    expect(verify).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
  });
});
