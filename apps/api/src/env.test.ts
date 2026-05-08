import { afterEach, describe, expect, it, vi } from "vitest"

const AUTH_SECRET =
  "012345678901234567890123456789012345678901234567890123456789"
const DATABASE_URL =
  "postgres://exposurenexus:exposurenexus@localhost:5432/exposurenexus"

async function loadEnv(
  overrides: Record<string, string> = {}
): Promise<typeof import("./env.js").env> {
  vi.resetModules()
  vi.stubEnv("AUTH_SECRET", AUTH_SECRET)
  vi.stubEnv("DATABASE_URL", DATABASE_URL)
  vi.stubEnv("APP_ORIGIN", "")
  vi.stubEnv("CORS_ORIGIN", "")
  vi.stubEnv("STATIC_DIR", "")

  for (const [key, value] of Object.entries(overrides)) {
    vi.stubEnv(key, value)
  }

  const module = await import("./env.js")
  return module.env
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe("api environment", () => {
  it("defaults the app origin for local split development", async () => {
    const env = await loadEnv()

    expect(env.APP_ORIGIN).toBe("http://localhost:3000")
  })

  it("prefers APP_ORIGIN for browser origin validation", async () => {
    const env = await loadEnv({
      APP_ORIGIN: "https://exposurenexus.example",
      CORS_ORIGIN: "http://localhost:3000"
    })

    expect(env.APP_ORIGIN).toBe("https://exposurenexus.example")
  })

  it("keeps CORS_ORIGIN as a deprecated alias", async () => {
    const env = await loadEnv({
      CORS_ORIGIN: "http://localhost:3000"
    })

    expect(env.APP_ORIGIN).toBe("http://localhost:3000")
    expect(env.CORS_ORIGIN).toBe("http://localhost:3000")
  })

  it("exposes the opt-in static asset directory", async () => {
    const env = await loadEnv({
      STATIC_DIR: "/app/public"
    })

    expect(env.STATIC_DIR).toBe("/app/public")
  })

  it("coerces numeric settings from process environment strings", async () => {
    const env = await loadEnv({
      PORT: "3002",
      API_TIMEOUT_MS: "7000",
      AUTH_SESSION_LIFETIME: "24"
    })

    expect(env.PORT).toBe(3002)
    expect(env.API_TIMEOUT_MS).toBe(7000)
    expect(env.AUTH_SESSION_LIFETIME).toBe(24)
  })
})
