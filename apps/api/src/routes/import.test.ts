import { Readable } from "node:stream";
import { text } from "node:stream/consumers";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createRequireDomainPermission } from "../middleware/auth.js";
import { createCsrfProtection } from "../middleware/csrf.js";
import {
  annotateAuthenticatedUser,
  createTestApp,
  createTestUser,
  requireAuthenticatedUser,
} from "../test/app.js";
import { createImportRoute } from "./import.js";

describe("finding import routes", () => {
  const user = createTestUser();
  const userHasPermission = vi.fn();
  const importSources = { register: vi.fn() };
  const ingestions = { submit: vi.fn() };
  const importSourceId = "6b80ec81-bfa7-435c-b41e-8d14510b5ee2";
  const metadata = {
    source: "nuclei",
    originalFilename: "scan.jsonl",
    sizeBytes: 0,
    mimeType: "application/x-ndjson",
  };
  const routeDependencies = {
    requireDomainPermission: createRequireDomainPermission(userHasPermission),
    ingestions,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    ingestions.submit.mockReset();
    userHasPermission.mockResolvedValue(true);
    importSources.register.mockResolvedValue({ id: importSourceId });
  });

  afterEach(() => vi.useRealTimers());

  it("uses the five-minute upload deadline instead of the ordinary timeout and waits for cancellation", async () => {
    vi.useFakeTimers();
    ingestions.submit.mockImplementation(
      ({ signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        }),
    );
    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      importerRoute: createImportRoute(importSources, routeDependencies),
    });
    const settled = vi.fn();
    const response = Promise.resolve(
      app.request(`/api/findings/import/${importSourceId}/content`, { method: "PUT" }),
    ).then(settled);
    await vi.advanceTimersByTimeAsync(5000);
    expect(ingestions.submit).toHaveBeenCalledOnce();
    expect(settled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(295000);
    await response;
    expect(settled.mock.calls[0]![0].status).toBe(504);
    expect(ingestions.submit.mock.calls[0]![0].signal.aborted).toBe(true);
  });

  it("streams raw content and returns durable acceptance in the data envelope", async () => {
    const accepted = {
      importSourceId,
      ingestionId: "97ce97b1-e994-4787-895c-23489e5cd337",
      jobId: "a1f3c2f0-abcf-44da-83e1-2d715f6fb86c",
    };
    ingestions.submit.mockImplementation(async (command) => {
      expect(command).toEqual({
        importSourceId,
        performedBy: user.id,
        body: expect.any(Readable),
        contentLength: 4,
        signal: expect.any(AbortSignal),
      });
      expect(await text(command.body)).toBe("oops");
      return accepted;
    });
    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      importerRoute: createImportRoute(importSources, routeDependencies),
    });
    const response = await app.request(`/api/findings/import/${importSourceId}/content`, {
      method: "PUT",
      headers: {
        "Content-Length": "4",
        "Content-Type": "application/json",
        "X-Request-Id": "upload",
      },
      body: "oops",
    });
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ correlationId: "upload", data: accepted });
    expect(ingestions.submit).toHaveBeenCalledOnce();
    expect(userHasPermission).toHaveBeenCalledWith(user.id, { import: ["write"] });
    expect(importSources.register).not.toHaveBeenCalled();
  });

  it.each(["POST", "PUT"])("returns 401 for unauthenticated %s requests", async (method) => {
    const requestId = "findings-import-unauthorized-request";
    const app = createTestApp({
      importerRoute: createImportRoute(importSources, routeDependencies),
      requireAuth: requireAuthenticatedUser,
    });

    const response = await app.request(
      method === "POST" ? "/api/findings/import" : `/api/findings/import/${importSourceId}/content`,
      {
        method,
        headers: {
          "X-Request-Id": requestId,
        },
      },
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({
      correlationId: requestId,
      status: 401,
      error: "Unauthorized",
    });
    expect(importSources.register).not.toHaveBeenCalled();
    expect(ingestions.submit).not.toHaveBeenCalled();
  });

  it("registers metadata for the authenticated creator and returns only its reference", async () => {
    const requestId = "findings-import-registration-request";
    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      importerRoute: createImportRoute(importSources, routeDependencies),
    });

    const response = await app.request("/api/findings/import", {
      method: "POST",
      headers: {
        "X-Request-Id": requestId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(metadata),
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual({
      correlationId: requestId,
      data: { importSourceId },
    });
    expect(importSources.register).toHaveBeenCalledExactlyOnceWith({
      ...metadata,
      performedBy: user.id,
    });
    expect(userHasPermission).toHaveBeenCalledWith(user.id, {
      import: ["write"],
    });
  });

  it.each(["POST", "PUT"])(
    "returns 403 for %s without current import write permission",
    async (method) => {
      userHasPermission.mockResolvedValue(false);
      const app = createTestApp({
        annotateAuth: annotateAuthenticatedUser(user),
        requireAuth: requireAuthenticatedUser,
        importerRoute: createImportRoute(importSources, routeDependencies),
      });

      const response = await app.request(
        method === "POST"
          ? "/api/findings/import"
          : `/api/findings/import/${importSourceId}/content`,
        {
          method,
          headers: {
            "X-Request-Id": "findings-import-forbidden-request",
          },
        },
      );

      expect(response.status).toBe(403);
      expect(userHasPermission).toHaveBeenCalledWith(user.id, {
        import: ["write"],
      });
      expect(importSources.register).not.toHaveBeenCalled();
      expect(ingestions.submit).not.toHaveBeenCalled();
    },
  );

  it.each([
    {},
    { ...metadata, source: "manual" },
    { ...metadata, originalFilename: "  " },
    { ...metadata, sizeBytes: -1 },
    { ...metadata, sizeBytes: 0.5 },
    { ...metadata, sizeBytes: Number.MAX_SAFE_INTEGER + 1 },
    { ...metadata, sizeBytes: "0" },
    { ...metadata, mimeType: null },
    { ...metadata, retentionPolicy: "keep" },
    { ...metadata, performedBy: user.id },
  ])("rejects invalid registration before calling the capability: %j", async (input) => {
    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      importerRoute: createImportRoute(importSources, routeDependencies),
    });
    const response = await app.request("/api/findings/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    expect(response.status).toBe(400);
    expect(importSources.register).not.toHaveBeenCalled();
  });

  it.each([undefined, "https://untrusted.example", "http://localhost:3000"])(
    "rejects CSRF failures before registration (origin %s)",
    async (origin) => {
      const app = createTestApp({
        annotateAuth: annotateAuthenticatedUser(user),
        requireAuth: requireAuthenticatedUser,
        csrfProtection: createCsrfProtection({
          allowedOrigins: ["http://localhost:3000"],
          tokenSecret: "test-secret",
        }).middleware,
        importerRoute: createImportRoute(importSources, routeDependencies),
      });
      for (const method of ["POST", "PUT"]) {
        const response = await app.request(
          method === "POST"
            ? "/api/findings/import"
            : `/api/findings/import/${importSourceId}/content`,
          {
            method,
            headers: {
              "Content-Type": "application/json",
              ...(origin ? { Origin: origin } : {}),
            },
            body: JSON.stringify(metadata),
          },
        );
        expect(response.status).toBe(403);
      }
      expect(importSources.register).not.toHaveBeenCalled();
      expect(ingestions.submit).not.toHaveBeenCalled();
    },
  );

  it.each(["", "-1", "1.5", "1e2", "0x4", "4, 4", "9007199254740992"])(
    "rejects malformed Content-Length before submission: %s",
    async (length) => {
      const app = createTestApp({
        annotateAuth: annotateAuthenticatedUser(user),
        importerRoute: createImportRoute(importSources, routeDependencies),
      });
      const response = await app.request(`/api/findings/import/${importSourceId}/content`, {
        method: "PUT",
        headers: { "Content-Length": length },
      });
      expect(response.status).toBe(400);
      expect(ingestions.submit).not.toHaveBeenCalled();
    },
  );

  it("rejects invalid source IDs before submission", async () => {
    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      importerRoute: createImportRoute(importSources, routeDependencies),
    });
    expect(
      (await app.request("/api/findings/import/not-a-uuid/content", { method: "PUT" })).status,
    ).toBe(400);
    expect(ingestions.submit).not.toHaveBeenCalled();
  });

  it("keeps registration on the ordinary timeout", async () => {
    vi.useFakeTimers();
    importSources.register.mockReturnValueOnce(new Promise(() => {}));
    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      apiTimeoutMs: 10,
      importUploadTimeoutMs: 100,
      importerRoute: createImportRoute(importSources, routeDependencies),
    });
    const response = app.request("/api/findings/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(metadata),
    });
    await vi.advanceTimersByTimeAsync(10);
    expect((await response).status).toBe(504);
  });

  it.each(["deadline", "shutdown", "disconnect"])(
    "prevents late submission when %s occurs during authentication",
    async (cancellation) => {
      vi.useFakeTimers();
      let authenticate!: () => void;
      const waiting = new Promise<void>((resolve) => {
        authenticate = resolve;
      });
      const controller = new AbortController();
      const app = createTestApp({
        importUploadTimeoutMs: 10,
        annotateAuth: async (c, next) => {
          await waiting;
          c.set("user", user);
          await next();
        },
        importerRoute: createImportRoute(importSources, routeDependencies),
      });
      const response = app.request(`/api/findings/import/${importSourceId}/content`, {
        method: "PUT",
        signal: controller.signal,
      });
      let closing: Promise<void> | undefined;
      if (cancellation === "deadline") await vi.advanceTimersByTimeAsync(10);
      else if (cancellation === "shutdown") closing = app.closeUploads();
      else controller.abort();
      authenticate();
      expect((await response).status).toBe(
        cancellation === "deadline" ? 504 : cancellation === "shutdown" ? 503 : 400,
      );
      await closing;
      expect(ingestions.submit).not.toHaveBeenCalled();
      if (cancellation === "shutdown") {
        expect(
          (await app.request(`/api/findings/import/${importSourceId}/content`, { method: "PUT" }))
            .status,
        ).toBe(503);
      }
    },
  );
});
