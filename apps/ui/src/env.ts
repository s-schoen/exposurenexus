import { createEnv } from "@t3-oss/env-core"
import { z } from "zod/v4"

function isApiBaseUrl(value: string): boolean {
  if (value.startsWith("/") && !value.startsWith("//")) {
    return true
  }

  try {
    new URL(value)
    return true
  } catch {
    return false
  }
}

export const env = createEnv({
  /**
   * The prefix that client-side variables must have. This is enforced both at
   * a type-level and at runtime.
   */
  clientPrefix: "VITE_",

  client: {
    VITE_API_URL: z
      .string()
      .trim()
      .min(1)
      .refine(isApiBaseUrl, {
        message: "Must be an absolute URL or same-origin path"
      })
      .default("/api")
  },

  /**
   * What object holds the environment variables at runtime. This is usually
   * `process.env` or `import.meta.env`.
   */
  runtimeEnv: import.meta.env,

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
