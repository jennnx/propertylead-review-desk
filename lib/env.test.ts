import { describe, expect, test } from "vitest";

import { importWithRequiredEnv, REQUIRED_TEST_ENV } from "@/tests/env";

describe("environment configuration", () => {
  test("loads required infrastructure configuration at import time", async () => {
    const { env } = await importWithRequiredEnv(() => import("./env"));

    expect(env).toEqual(REQUIRED_TEST_ENV);
  });

  // Representative canary: if this required-var test fails, import-time Zod
  // validation is not wired. Do not add one env test per schema field.
  test("requires the Anthropic API key", async () => {
    await expect(
      importWithRequiredEnv(() => import("./env"), {
        ANTHROPIC_API_KEY: "",
      }),
    ).rejects.toThrow(/ANTHROPIC_API_KEY/);
  });
});
