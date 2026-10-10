import process from "node:process";

import { defineConfig, devices } from "@playwright/test";

// Browser smoke tests: drive the real UI in Chromium against `pnpm dev:mock` (MSW in the service
// worker, same handlers and seed as Vitest). See AGENTS.md, "Browser smoke tests".
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm dev:mock --strictPort",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    // The first start optimizes dependencies, which can take a while.
    timeout: 180_000,
    // Show Vite's output, e.g. a "page reload" that would reset the in-memory mock data.
    stdout: "pipe",
  },
});
