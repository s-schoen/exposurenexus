import {
  VulnerabilitySeverity,
  VulnerabilityType,
  type VulnerabilityCatalog,
} from "@exposurenexus/types/model/vulnerability";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createRequireDomainPermission } from "../middleware/auth.js";
import { ApplicationError } from "../service/application-error.js";
import {
  annotateAuthenticatedUser,
  createTestApp,
  createTestUser,
  requireAuthenticatedUser,
} from "../test/app.js";
import { createVulnerabilityRoute } from "./vulnerabilities.js";

describe("vulnerability catalog routes", () => {
  const user = createTestUser();
  const userHasPermission = vi.fn();
  const routeDependencies = {
    requireDomainPermission: createRequireDomainPermission(userHasPermission),
  };
  const vulnerabilityId = "9d7acdd0-fad1-46c9-8218-1793f421f0fe";
  const vulnerabilityRecord: VulnerabilityCatalog = {
    id: vulnerabilityId,
    type: VulnerabilityType.Cve,
    identifier: "CVE-2026-0001",
    title: "Exposed Admin Endpoint",
    severity: VulnerabilitySeverity.High,
    description: "Administrative interface is reachable externally",
    metadata: { cvss: 8.1 },
    createdBy: user.id,
    updatedBy: user.id,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };
  const vulnerabilityService = {
    listAll: vi.fn(),
    getByID: vi.fn(),
    create: vi.fn(),
    updateByID: vi.fn(),
    deleteByID: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    userHasPermission.mockResolvedValue(true);
  });

  function createApp() {
    return createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      vulnerabilityRoute: createVulnerabilityRoute(vulnerabilityService, routeDependencies),
    });
  }

  it("lists catalog entries for readers", async () => {
    vulnerabilityService.listAll.mockResolvedValue([vulnerabilityRecord]);

    const response = await createApp().request("/api/vulnerabilities", {
      headers: { "X-Request-Id": "catalog-list-request" },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      correlationId: "catalog-list-request",
      data: { items: [expect.objectContaining({ identifier: "CVE-2026-0001" })] },
    });
  });

  it("returns a catalog entry by id and 404 for a missing entry", async () => {
    vulnerabilityService.getByID
      .mockResolvedValueOnce(vulnerabilityRecord)
      .mockResolvedValueOnce(null);

    const found = await createApp().request(`/api/vulnerabilities/${vulnerabilityId}`);
    const missing = await createApp().request(`/api/vulnerabilities/${vulnerabilityId}`);

    expect(found.status).toBe(200);
    expect(await found.json()).toMatchObject({ data: { id: vulnerabilityId } });
    expect(missing.status).toBe(404);
  });

  it("rejects invalid catalog ids before calling the service", async () => {
    const response = await createApp().request("/api/vulnerabilities/not-a-uuid");

    expect(response.status).toBe(400);
    expect(vulnerabilityService.getByID).not.toHaveBeenCalled();
  });

  it("creates catalog entries with the authenticated actor", async () => {
    const payload = {
      type: VulnerabilityType.Cve,
      identifier: "cve-2026-0001",
      title: "Exposed Admin Endpoint",
      severity: VulnerabilitySeverity.High,
      description: "Administrative interface is reachable externally",
      metadata: { cvss: 8.1 },
    };
    vulnerabilityService.create.mockResolvedValue(vulnerabilityRecord);

    const response = await createApp().request("/api/vulnerabilities", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": "catalog-create-request",
      },
      body: JSON.stringify(payload),
    });

    expect(response.status).toBe(201);
    expect(vulnerabilityService.create).toHaveBeenCalledWith({
      vulnerability: { ...payload, identifier: "CVE-2026-0001" },
      user,
      eventContext: { actor: user.id, correlationId: "catalog-create-request" },
    });
  });

  it("rejects malformed catalog input before calling the service", async () => {
    const response = await createApp().request("/api/vulnerabilities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: VulnerabilityType.Cve,
        identifier: "not-a-cve",
        title: "Example",
        severity: VulnerabilitySeverity.High,
      }),
    });

    expect(response.status).toBe(400);
    expect(vulnerabilityService.create).not.toHaveBeenCalled();
  });

  it("updates a catalog entry without changing its id", async () => {
    vulnerabilityService.updateByID.mockResolvedValue({
      ...vulnerabilityRecord,
      type: VulnerabilityType.Custom,
      identifier: "exposed-admin-panel",
    });

    const response = await createApp().request(`/api/vulnerabilities/${vulnerabilityId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: VulnerabilityType.Custom,
        identifier: "Exposed-Admin-Panel",
        title: vulnerabilityRecord.title,
        severity: vulnerabilityRecord.severity,
        description: vulnerabilityRecord.description,
        metadata: vulnerabilityRecord.metadata,
      }),
    });

    expect(response.status).toBe(200);
    expect(vulnerabilityService.updateByID).toHaveBeenCalledWith(
      expect.objectContaining({
        id: vulnerabilityId,
        vulnerability: expect.objectContaining({
          type: VulnerabilityType.Custom,
          identifier: "exposed-admin-panel",
        }),
        user,
      }),
    );
    expect(await response.json()).toMatchObject({
      data: { id: vulnerabilityId, identifier: "exposed-admin-panel" },
    });
  });

  it("returns 404 when updating a missing catalog entry", async () => {
    vulnerabilityService.updateByID.mockResolvedValue(null);
    const response = await createApp().request(`/api/vulnerabilities/${vulnerabilityId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: VulnerabilityType.Cve,
        identifier: "CVE-2026-0001",
        title: "Example",
        severity: VulnerabilitySeverity.High,
      }),
    });

    expect(response.status).toBe(404);
  });

  it("rejects invalid update input before calling the service", async () => {
    const response = await createApp().request(`/api/vulnerabilities/${vulnerabilityId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: VulnerabilityType.Cve,
        identifier: "not-a-cve",
        title: "Example",
        severity: VulnerabilitySeverity.High,
      }),
    });

    expect(response.status).toBe(400);
    expect(vulnerabilityService.updateByID).not.toHaveBeenCalled();
  });

  it("maps update identity conflicts to 409", async () => {
    vulnerabilityService.updateByID.mockRejectedValue(
      new ApplicationError({
        code: "vulnerability.identity_conflict",
        kind: "conflict",
        message: "duplicate catalog identity",
        details: { type: VulnerabilityType.Cve, identifier: "CVE-2026-0001" },
      }),
    );
    const response = await createApp().request(`/api/vulnerabilities/${vulnerabilityId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: VulnerabilityType.Cve,
        identifier: "CVE-2026-0001",
        title: "Example",
        severity: VulnerabilitySeverity.High,
      }),
    });

    expect(response.status).toBe(409);
  });

  it("deletes catalog entries without checking for linked findings", async () => {
    vulnerabilityService.deleteByID.mockResolvedValue(vulnerabilityRecord);

    const response = await createApp().request(`/api/vulnerabilities/${vulnerabilityId}`, {
      method: "DELETE",
    });

    expect(response.status).toBe(200);
    expect(vulnerabilityService.deleteByID).toHaveBeenCalledWith(
      vulnerabilityId,
      expect.objectContaining({ actor: user.id }),
    );
  });

  it("returns 404 when deleting a missing catalog entry", async () => {
    vulnerabilityService.deleteByID.mockResolvedValue(null);

    const response = await createApp().request(`/api/vulnerabilities/${vulnerabilityId}`, {
      method: "DELETE",
    });

    expect(response.status).toBe(404);
  });

  it("maps create identity conflicts to 409", async () => {
    vulnerabilityService.create.mockRejectedValue(
      new ApplicationError({
        code: "vulnerability.identity_conflict",
        kind: "conflict",
        message: "a vulnerability with this type and identifier already exists",
        details: { type: VulnerabilityType.Cve, identifier: "CVE-2026-0001" },
      }),
    );

    const response = await createApp().request("/api/vulnerabilities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: VulnerabilityType.Cve,
        identifier: "CVE-2026-0001",
        title: "Example",
        severity: VulnerabilitySeverity.High,
      }),
    });

    expect(response.status).toBe(409);
  });

  it("requires authentication", async () => {
    const app = createTestApp({
      requireAuth: requireAuthenticatedUser,
      vulnerabilityRoute: createVulnerabilityRoute(vulnerabilityService, routeDependencies),
    });

    expect((await app.request("/api/vulnerabilities")).status).toBe(401);
  });

  it.each([
    ["read", "GET", "/api/vulnerabilities"],
    ["write", "POST", "/api/vulnerabilities"],
    ["write", "PUT", `/api/vulnerabilities/${vulnerabilityId}`],
    ["delete", "DELETE", `/api/vulnerabilities/${vulnerabilityId}`],
  ] as const)("wires %s permission for %s %s", async (permission, method, url) => {
    userHasPermission.mockResolvedValue(false);
    const response = await createApp().request(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: method === "POST" || method === "PUT" ? "{}" : undefined,
    });

    expect(response.status).toBe(403);
    expect(userHasPermission).toHaveBeenCalledWith(user.id, {
      vulnerability: [permission],
    });
  });
});
