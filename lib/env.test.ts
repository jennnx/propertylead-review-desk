import { describe, expect, test } from "vitest";

import { importWithRequiredEnv, REQUIRED_TEST_ENV } from "@/tests/env";

describe("environment configuration", () => {
  test("loads required infrastructure configuration at import time", async () => {
    const { env } = await importWithRequiredEnv(() => import("./env"));

    expect(env).toEqual(REQUIRED_TEST_ENV);
  });

  test("requires the Anthropic API key", async () => {
    await expect(
      importWithRequiredEnv(() => import("./env"), {
        ANTHROPIC_API_KEY: undefined,
      }),
    ).rejects.toThrow(/ANTHROPIC_API_KEY is required/);
  });
});
