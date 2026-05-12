import { config as loadDotenv } from "dotenv";
import path from "node:path";
import { z } from "zod";

loadDotenv({ quiet: true });

const envSchema = z.object({
  APP_BASE_URL: z.url({
    error: "APP_BASE_URL is required and must be an absolute http(s) URL",
    protocol: /^https?$/,
  }),
  DATABASE_URL: z
    .string({
      error: "DATABASE_URL is required (e.g. postgresql://user:pass@host:5432/db)",
    })
    .min(1, "DATABASE_URL must not be empty"),
  REDIS_URL: z
    .string({ error: "REDIS_URL is required (e.g. redis://localhost:6379)" })
    .min(1, "REDIS_URL must not be empty"),
  ANTHROPIC_API_KEY: z
    .string({ error: "ANTHROPIC_API_KEY is required" })
    .min(1, "ANTHROPIC_API_KEY must not be empty"),
  VOYAGE_API_KEY: z
    .string({ error: "VOYAGE_API_KEY is required" })
    .min(1, "VOYAGE_API_KEY must not be empty"),
  SOP_STORAGE_DIR: z
    .string({ error: "SOP_STORAGE_DIR is required" })
    .min(1, "SOP_STORAGE_DIR must not be empty")
    .refine(path.isAbsolute, "SOP_STORAGE_DIR must be an absolute path"),
  HUBSPOT_CLIENT_SECRET: z
    .string({ error: "HUBSPOT_CLIENT_SECRET is required" })
    .min(1, "HUBSPOT_CLIENT_SECRET must not be empty"),
  HUBSPOT_ACCESS_TOKEN: z
    .string({ error: "HUBSPOT_ACCESS_TOKEN is required" })
    .min(1, "HUBSPOT_ACCESS_TOKEN must not be empty"),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

export function loadEnv(): Env {
  if (cached) return cached;
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => {
        const path = issue.path.join(".") || "(root)";
        return `  - ${path}: ${issue.message}`;
      })
      .join("\n");
    throw new Error(
      `Invalid infrastructure environment variables:\n${details}\n\nSee .env.example for the required configuration.`,
    );
  }
  cached = result.data;
  return cached;
}

export const env: Env = loadEnv();
