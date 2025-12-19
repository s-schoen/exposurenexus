import { createEnv } from "@t3-oss/env-core"
import { z } from "zod/v4"

export const env = createEnv({
  server: {
    PORT: z.number().min(1).max(65535).default(3001),
    LOG_LEVEL: z.string().optional().default("info"),
    API_TIMEOUT_MS: z.number().min(1).default(5000),
    AUTH_URL: z.url().default("http://localhost:3001"),

    AUTH_SECRET: z.string().min(32),
    DATABASE_URL: z.url()
  },

  /**
   * What object holds the environment variables at runtime. This is usually
   * `process.env` or `import.meta.env`.
   */
  runtimeEnv: process.env,

  /**
   * By default, this library will feed the environment variables directly to
   * the Zod validator.
   *
   * This means that if you have an empty string for a value that is supposed
   * to be a number (e.g. `PORT=` in a ".env" file), Zod will incorrectly flag
   * it as a type mismatch violation. Additionally, if you have an empty string
   * for a value that is supposed to be a string with a default value (e.g.
   * `DOMAIN=` in an ".env" file), the default value will never be applied.
   *
   * In order to solve these issues, we recommend that all new projects
   * explicitly specify this option as true.
   */
  emptyStringAsUndefined: true
})
