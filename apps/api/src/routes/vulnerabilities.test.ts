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

  it("returns and updates a catalog entry without changing its id", async () => {
    vulnerabilityService.getByID.mockResolvedValue(vulnerabilityRecord);
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

  it("maps catalog identity conflicts to 409", async () => {
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

  it("uses the vulnerability permission resource for catalog CRUD", async () => {
    userHasPermission.mockResolvedValue(false);

    const response = await createApp().request(`/api/vulnerabilities/${vulnerabilityId}`, {
      method: "DELETE",
    });

    expect(response.status).toBe(403);
    expect(userHasPermission).toHaveBeenCalledWith(user.id, {
      vulnerability: ["delete"],
    });
    expect(vulnerabilityService.deleteByID).not.toHaveBeenCalled();
  });
});
