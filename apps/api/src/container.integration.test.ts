import { serve } from "@hono/node-server";
import { pino } from "pino";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createAppContainer } from "./container.js";
import { CSRF_COOKIE, CSRF_HEADER } from "./middleware/csrf.js";
import { createTestDatabase } from "./test/db.js";

vi.mock("./env.js", () => ({ env: { LOG_LEVEL: "silent" } }));

describe("API backend cutover", () => {
  const testDb = createTestDatabase();
  const logger = pino({ enabled: false });
  let server: ReturnType<typeof serve> | undefined;
  let origin: string;
  let initialPassword: string;
  const cookies = new Map<string, string>();

  beforeAll(async () => {
    await testDb.start();
    const bootstrapLogger = vi.spyOn(logger, "info");
    const container = createAppContainer({
      db: testDb.db,
      appOrigin: "https://app.example.test",
      authSessionLifetimeHours: 12,
      authSessionHmacSecret: "0123456789012345678901234567890123456789",
      authCookieSecure: true,
      authTrustedProxies: [],
      apiTimeoutMs: 5000,
      logger,
      accessLogger: logger,
      dbLogger: logger,
      loggerFactory: () => logger,
    });
    await container.createDefaultAdmin();
    const message = bootstrapLogger.mock.calls.find(
      ([value]) => typeof value === "string" && value.startsWith("created admin user:"),
    )?.[0];
    if (typeof message !== "string") {
      throw new Error("bootstrap did not report initial credentials");
    }
    initialPassword = String(message).split("password=")[1]!;
    bootstrapLogger.mockRestore();
    await new Promise<void>((resolve) => {
      server = serve({ fetch: container.app.fetch, hostname: "127.0.0.1", port: 0 }, (info) => {
        origin = `http://127.0.0.1:${info.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (server) {
      const activeServer = server;
      await new Promise<void>((resolve, reject) => {
        activeServer.close((error) => (error ? reject(error) : resolve()));
      });
    }
    await testDb.dispose();
  });

  async function request(path: string, method = "GET", body?: object, status = 200) {
    const response = await fetch(`${origin}/api${path}`, {
      method,
      headers: {
        Origin: "https://app.example.test",
        "Content-Type": "application/json",
        Cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join("; "),
        [CSRF_HEADER]: decodeURIComponent(cookies.get(CSRF_COOKIE) ?? ""),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(";")[0]!;
      const separator = pair.indexOf("=");
      cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
    const result = await response.json();
    expect({ status: response.status, body: result }).toMatchObject({ status });
    return result;
  }

  it("serves authenticated identity, asset and exposure workflows after migrations", async () => {
    await request("/assets", "GET", undefined, 401);
    await request("/auth", "POST", { username: "admin", password: "wrong" }, 401);
    const login = await request("/auth", "POST", { username: "admin", password: initialPassword });
    expect(login.data.user.username).toBe("admin");
    expect(login.data.session).not.toHaveProperty("tokenHash");
    expect(login.data.user).not.toHaveProperty("passwordHash");
    await request("/auth/session");
    await request("/users");
    await request("/roles");
    const user = await request(
      "/users",
      "POST",
      {
        username: "analyst",
        displayName: "Analyst",
        email: "analyst@example.test",
        password: "analyst-password",
        enabled: true,
        roleIds: [],
      },
      201,
    );
    const asset = await request(
      "/assets",
      "POST",
      {
        displayName: "Smoke host",
        type: "host",
        ownerId: user.data.id,
      },
      201,
    );
    const field = await request(
      "/assets/custom-fields",
      "POST",
      {
        key: "team",
        name: "Team",
        type: "text",
        required: false,
      },
      201,
    );
    await request(`/assets/${asset.data.id}/custom-fields/associations`, "PUT", {
      fieldIds: [field.data.id],
    });
    await request(`/assets/${asset.data.id}/custom-fields`, "PUT", {
      values: [{ fieldId: field.data.id, value: "Security" }],
    });
    const fields = await request(`/assets/${asset.data.id}/custom-fields`);
    expect(fields.data.items).toEqual([expect.objectContaining({ value: "Security" })]);
    const vulnerability = await request(
      "/vulnerabilities",
      "POST",
      {
        type: "custom",
        identifier: "smoke-weakness",
        title: "Smoke weakness",
        severity: "high",
      },
      201,
    );
    const finding = await request(
      "/findings",
      "POST",
      {
        assetId: asset.data.id,
        title: "Exposed panel",
        severity: "high",
        status: "active",
        weakness: { identifiers: {} },
        affectedResource: { type: "unspecified" },
        vulnerabilityIds: [vulnerability.data.id],
        observation: { evidence: "Panel reachable" },
      },
      201,
    );
    const observations = await request(`/findings/${finding.data.id}/observations`);
    expect(observations.data.items).toHaveLength(1);
    await request(
      `/findings/${finding.data.id}/observations/${observations.data.items[0].id}`,
      "PUT",
      {
        evidence: "Confirmed reachable",
      },
    );
    await request(`/findings/${finding.data.id}`, "PUT", { status: "confirmed" });
    expect((await request(`/findings/${finding.data.id}`)).data).toMatchObject({
      status: "confirmed",
      observationCount: 1,
      vulnerabilities: [expect.objectContaining({ id: vulnerability.data.id })],
    });
    expect((await request("/findings/stats")).data).toMatchObject({
      total: 1,
      status: { confirmed: 1 },
      severity: { high: 1 },
    });
    await request(`/assets/${asset.data.id}`, "DELETE", undefined, 409);
    await request(`/findings/${finding.data.id}`, "DELETE");
    await request(`/vulnerabilities/${vulnerability.data.id}`, "DELETE");
    await request(`/assets/${asset.data.id}`, "DELETE");
    await request("/auth", "DELETE");
    await request("/assets", "GET", undefined, 401);
    await request("/auth", "POST", { username: "analyst", password: "analyst-password" });
    await request("/assets", "GET", undefined, 403);
  });
});
