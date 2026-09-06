import { afterEach, describe, expect, it, vi } from "vitest";

async function loadEnv() {
  vi.resetModules();
  return import("@/lib/env.ts");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("environment validation", () => {
  it.each([
    { name: "a trimmed same-origin path", value: "  /api  ", expected: "/api" },
    {
      name: "an absolute URL",
      value: " https://api.example.test/v1 ",
      expected: "https://api.example.test/v1",
    },
  ])("accepts $name and exports the normalized value", async ({ value, expected }) => {
    vi.stubEnv("VITE_API_URL", value);

    const { env } = await loadEnv();

    expect(env).toEqual({ VITE_API_URL: expected });
  });

  it.each([
    { name: "missing", value: undefined },
    { name: "empty", value: "" },
  ])("defaults a $name API URL to /api", async ({ value }) => {
    if (value !== undefined) {
      vi.stubEnv("VITE_API_URL", value);
    }

    const { env } = await loadEnv();

    expect(env).toEqual({ VITE_API_URL: "/api" });
  });

  it.each([
    { name: "protocol-relative", value: "//api.example.test" },
    { name: "invalid relative", value: "api.example.test" },
    { name: "whitespace-only", value: "   " },
  ])("rejects $name API URLs during module import", async ({ value }) => {
    vi.stubEnv("VITE_API_URL", value);

    await expect(loadEnv()).rejects.toThrow();
  });
});
