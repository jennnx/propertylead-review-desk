import { config as loadDotenv } from "dotenv";
import { z } from "zod";

loadDotenv();

const envSchema = z.object({
  DATABASE_URL: z
    .string({
      error: "DATABASE_URL is required (e.g. postgresql://user:pass@host:5432/db)",
    })
    .min(1, "DATABASE_URL must not be empty"),
  REDIS_URL: z
    .string({ error: "REDIS_URL is required (e.g. redis://localhost:6379)" })
    .min(1, "REDIS_URL must not be empty"),
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

export const env: Env = new Proxy({} as Env, {
  get(_target, prop) {
    return loadEnv()[prop as keyof Env];
  },
  has(_target, prop) {
    return prop in loadEnv();
  },
  ownKeys() {
    return Reflect.ownKeys(loadEnv());
  },
  getOwnPropertyDescriptor(_target, prop) {
    return Object.getOwnPropertyDescriptor(loadEnv(), prop);
  },
});
