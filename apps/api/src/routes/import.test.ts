import { beforeEach, describe, expect, it, vi } from "vitest";

import { createRequireDomainPermission } from "../middleware/auth.js";
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
  const routeDependencies = {
    requireDomainPermission: createRequireDomainPermission(userHasPermission),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    userHasPermission.mockResolvedValue(true);
  });

  it("returns 401 for unauthenticated requests", async () => {
    const requestId = "findings-import-unauthorized-request";
    const app = createTestApp({
      importerRoute: createImportRoute(routeDependencies),
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
  });

  it("returns 501 without reading or processing an import", async () => {
    const requestId = "findings-import-wip-request";
    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      importerRoute: createImportRoute(routeDependencies),
    });

    const response = await app.request("/api/findings/import", {
      method: "POST",
      headers: {
        "X-Request-Id": requestId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ type: "nuclei", file: "ignored" }),
    });
    const body = await response.json();

    expect(response.status).toBe(501);
    expect(body).toEqual({
      correlationId: requestId,
      status: 501,
      error: "Automated finding imports are not available yet",
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
      importerRoute: createImportRoute(routeDependencies),
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
  });
});
