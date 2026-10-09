/// <reference types="vitest/config" />
import { URL, fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { msw } from "msw/vite";
import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    devtools(),
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
      quoteStyle: "double",
      semicolons: true,
      routeTreeFileHeader: [
        "/* oxlint-disable */",
        "// @ts-nocheck",
        "// noinspection JSUnusedGlobalSymbols",
      ],
    }),
    viteReact(),
    tailwindcss(),
    // `pnpm dev:mock`: serve the MSW service worker. Never registered for builds, so it never ships.
    mode === "mock" && msw({ mode: "worker-only" }),
  ],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3001",
      },
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    coverage: {
      reporter: ["text", "html", "lcov"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/test/**",
        "src/**/*.test.{ts,tsx}",
        "src/**/*.d.ts",
        "src/components/ui/**",
        "src/integrations/tanstack-query/devtools.tsx",
        "src/main.tsx",
        "src/routeTree.gen.ts",
      ],
    },
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    testTimeout: 15000,
    setupFiles: ["./src/test/setup.ts"],
  },
}));
