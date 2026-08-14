import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createTestApp } from "./test/app.js";

import type { ContextVariables } from "./lib/hono-schema.js";
import type { ServerType } from "@hono/node-server";
import type { MiddlewareHandler } from "hono";

const INDEX_HTML = '<!doctype html><title>ExposureNexus</title><div id="root"></div>';
const ASSET_JS = "console.log('exposurenexus')\n";

const staticDirs: string[] = [];
const servers: ServerType[] = [];

async function createStaticDir(): Promise<string> {
  const staticDir = await mkdtemp(join(tmpdir(), "exposurenexus-static-"));
  staticDirs.push(staticDir);

  await mkdir(join(staticDir, "assets"));
  await writeFile(join(staticDir, "index.html"), INDEX_HTML);
  await writeFile(join(staticDir, "assets", "app.js"), ASSET_JS);

  return staticDir;
}

async function startServer(app: ReturnType<typeof createTestApp>) {
  const address = await new Promise<{ port: number }>((resolve, reject) => {
    const server = serve(
      {
        fetch: app.fetch,
        hostname: "127.0.0.1",
        port: 0,
      },
      resolve,
    );
    servers.push(server);
    server.once("error", reject);
  });

  return `http://127.0.0.1:${address.port}`;
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error) {
              reject(error);
              return;
            }

            resolve();
          });
        }),
    ),
  );
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

describe("Hono Node server adapter", () => {
  it("serves API JSON requests and static files over a real socket", async () => {
    const healthRoute = new Hono();
    healthRoute.get("/", (c) => c.json({ status: "ok" }));
    healthRoute.post("/echo", async (c) => c.json(await c.req.json()));

    const app = createTestApp({
      healthRoute,
      staticDir: await createStaticDir(),
    });
    const url = await startServer(app);

    const healthResponse = await fetch(`${url}/api/health`);
    expect(healthResponse.status).toBe(200);
    await expect(healthResponse.json()).resolves.toEqual({ status: "ok" });

    const echoResponse = await fetch(`${url}/api/health/echo`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: "hello" }),
    });
    expect(echoResponse.status).toBe(200);
    await expect(echoResponse.json()).resolves.toEqual({ message: "hello" });

    const staticResponse = await fetch(`${url}/assets/app.js`);
    expect(staticResponse.status).toBe(200);
    await expect(staticResponse.text()).resolves.toBe(ASSET_JS);
  });
});
