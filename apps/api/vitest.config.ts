import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    hookTimeout: 30000,
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/test/**",
        "src/index.ts",
        "src/env.ts",
        // Migrations are covered by provider/full-chain tests and focused tests
        // for risky data changes, not by requiring isolated coverage per file.
        "src/db/migrations/**",
      ],
    },
  },
});
