import { createEnv } from "@t3-oss/env-core"
import { z } from "zod/v4"
import { isValidTrustedProxy } from "./lib/source-ip.js"

function trustedProxies(value: string): string[] {
  return value
    .split(",")
    .map((proxy) => proxy.trim())
    .filter((proxy) => proxy.length > 0)
}

function configuredAppOrigin(
  environment: NodeJS.ProcessEnv
): string | undefined {
  const appOrigin = environment.APP_ORIGIN?.trim()
  if (appOrigin) {
    return environment.APP_ORIGIN
  }

  const corsOrigin = environment.CORS_ORIGIN?.trim()
  if (corsOrigin) {
    return environment.CORS_ORIGIN
  }

  return undefined
}

export const env = createEnv({
  server: {
    PORT: z.number().min(1).max(65535).default(3001),
    LOG_LEVEL: z.string().optional().default("info"),
    API_TIMEOUT_MS: z.number().min(1).default(5000),
    APP_ORIGIN: z.url().default("http://localhost:3000"),
    STATIC_DIR: z.string().min(1).optional(),
    CORS_ORIGIN: z.url().optional(),
    AUTH_SESSION_LIFETIME: z.number().min(1).default(12),
    AUTH_COOKIE_SECURE: z
      .enum(["true", "false"])
      .default("true")
      .transform((value) => value === "true"),

    AUTH_SECRET: z.string().min(32),
    AUTH_TRUSTED_PROXIES: z
      .string()
      .default("")
      .transform((value, ctx) => {
        const proxies = trustedProxies(value)
        const invalidProxies = proxies.filter(
          (proxy) => !isValidTrustedProxy(proxy)
        )

        if (invalidProxies.length > 0) {
          ctx.addIssue({
            code: "custom",
            message: `invalid trusted proxy entries: ${invalidProxies.join(", ")}`
          })
          return z.NEVER
        }

        return proxies
      }),
    DATABASE_URL: z.url()
  },

  /**
   * What object holds the environment variables at runtime. This is usually
   * `process.env` or `import.meta.env`.
   */
  runtimeEnv: {
    ...process.env,
    APP_ORIGIN: configuredAppOrigin(process.env)
  },

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
