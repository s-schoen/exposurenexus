import { beforeEach, describe, expect, it, vi } from "vitest";

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
  const importSourceId = "6b80ec81-bfa7-435c-b41e-8d14510b5ee2";
  const metadata = {
    source: "nuclei",
    originalFilename: "scan.jsonl",
    sizeBytes: 0,
    mimeType: "application/x-ndjson",
  };
  const routeDependencies = {
    requireDomainPermission: createRequireDomainPermission(userHasPermission),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    userHasPermission.mockResolvedValue(true);
    importSources.register.mockResolvedValue({ id: importSourceId });
  });

  it("returns 401 for unauthenticated requests", async () => {
    const requestId = "findings-import-unauthorized-request";
    const app = createTestApp({
      importerRoute: createImportRoute(importSources, routeDependencies),
      requireAuth: requireAuthenticatedUser,
    });

    const response = await app.request("/api/findings/import", {
      method: "POST",
      headers: {
        "X-Request-Id": requestId,
      },
    });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({
      correlationId: requestId,
      status: 401,
      error: "Unauthorized",
    });
    expect(importSources.register).not.toHaveBeenCalled();
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

  it("returns 403 when importing findings without write permission", async () => {
    userHasPermission.mockResolvedValue(false);
    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      importerRoute: createImportRoute(importSources, routeDependencies),
    });

    const response = await app.request("/api/findings/import", {
      method: "POST",
      headers: {
        "X-Request-Id": "findings-import-forbidden-request",
      },
    });

    expect(response.status).toBe(403);
    expect(userHasPermission).toHaveBeenCalledWith(user.id, {
      import: ["write"],
    });
    expect(importSources.register).not.toHaveBeenCalled();
  });

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
      const response = await app.request("/api/findings/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(origin ? { Origin: origin } : {}),
        },
        body: JSON.stringify(metadata),
      });
      expect(response.status).toBe(403);
      expect(importSources.register).not.toHaveBeenCalled();
    },
  );
});
