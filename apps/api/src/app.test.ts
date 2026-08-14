import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createTestApp } from "./test/app.js";

import type { ContextVariables } from "./lib/hono-schema.js";
import type { MiddlewareHandler } from "hono";

const INDEX_HTML = '<!doctype html><title>ExposureNexus</title><div id="root"></div>';
const ASSET_JS = "console.log('exposurenexus')\n";

const staticDirs: string[] = [];

async function createStaticDir(): Promise<string> {
  const staticDir = await mkdtemp(join(tmpdir(), "exposurenexus-static-"));
  staticDirs.push(staticDir);

  await mkdir(join(staticDir, "assets"));
  await writeFile(join(staticDir, "index.html"), INDEX_HTML);
  await writeFile(join(staticDir, "assets", "app.js"), ASSET_JS);

  return staticDir;
}

afterEach(async () => {
  await Promise.all(
    staticDirs.splice(0).map((staticDir) => rm(staticDir, { recursive: true, force: true })),
  );
});

describe("static app serving", () => {
  it("is disabled unless a static directory is configured", async () => {
    const app = createTestApp();

    const response = await app.request("/assets/app.js");

    expect(response.status).toBe(404);
    await expect(response.text()).resolves.not.toBe(ASSET_JS);
  });

  it("serves static assets outside /api without authentication", async () => {
    const requireAuth = vi.fn<MiddlewareHandler<{ Variables: ContextVariables }>>(() => {
      throw new Error("static assets must not require authentication");
    });
    const app = createTestApp({
      staticDir: await createStaticDir(),
      requireAuth,
    });

    const response = await app.request("/assets/app.js");

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toMatch(/javascript/);
    await expect(response.text()).resolves.toBe(ASSET_JS);
    expect(requireAuth).not.toHaveBeenCalled();
  });

  it("preserves API-style 404 responses for unknown API paths", async () => {
    const app = createTestApp({
      staticDir: await createStaticDir(),
    });

    const response = await app.request("/api/not-a-route", {
      headers: {
        "X-Request-Id": "missing-api-route",
      },
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(body).toEqual({
      correlationId: "missing-api-route",
      status: 404,
      error: "Not Found",
    });
  });

  it("falls back to index.html for non-API browser navigation paths", async () => {
    const app = createTestApp({
      staticDir: await createStaticDir(),
    });

    const getResponse = await app.request("/findings/active");
    const headResponse = await app.request("/findings/active", {
      method: "HEAD",
    });

    expect(getResponse.status).toBe(200);
    expect(getResponse.headers.get("Content-Type")).toContain("text/html");
    await expect(getResponse.text()).resolves.toBe(INDEX_HTML);
    expect(headResponse.status).toBe(200);
    expect(headResponse.headers.get("Content-Length")).toBe(String(Buffer.byteLength(INDEX_HTML)));
    await expect(headResponse.text()).resolves.toBe("");
  });
});
