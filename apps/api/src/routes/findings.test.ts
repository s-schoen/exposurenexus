import { AffectedResourceType } from "@exposurenexus/contracts/model/affected-resource";
import { FindingStatus, type Finding } from "@exposurenexus/contracts/model/finding";
import {
  VulnerabilitySeverity,
  VulnerabilityType,
} from "@exposurenexus/contracts/model/vulnerability";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createRequireDomainPermission } from "../middleware/auth.js";
import { ApplicationError } from "../service/application-error.js";
import {
  annotateAuthenticatedUser,
  createTestApp,
  createTestUser,
  requireAuthenticatedUser,
} from "../test/app.js";
import { createFindingRoute } from "./findings.js";

describe("finding routes", () => {
  const user = createTestUser();
  const userHasPermission = vi.fn();
  const routeDependencies = {
    requireDomainPermission: createRequireDomainPermission(userHasPermission),
  };
  const findingId = "2713d833-eb13-4517-ac7c-7761545ed42a";
  const observationId = "f39a0c31-33b9-4f10-a128-35158dee4a26";
  const vulnerabilityId = "9d7acdd0-fad1-46c9-8218-1793f421f0fe";
  const assetId = "447b53a7-c3ce-4a0c-b96a-099f5e5dc71c";
  const assigneeId = "f74d7ff2-2d81-4d1e-9fa9-73af7d46a37d";
  const findingService = {
    listAll: vi.fn(),
    getByID: vi.fn(),
    createManual: vi.fn(),
    updateByID: vi.fn(),
    linkVulnerability: vi.fn(),
    unlinkVulnerability: vi.fn(),
    deleteByID: vi.fn(),
    listObservations: vi.fn(),
    createManualObservation: vi.fn(),
    updateObservation: vi.fn(),
    deleteObservation: vi.fn(),
    moveObservation: vi.fn(),
  };
  const vulnerability = {
    id: vulnerabilityId,
    type: VulnerabilityType.Custom,
    identifier: "exposed-admin-endpoint",
    title: "Exposed Admin Endpoint",
    severity: VulnerabilitySeverity.High,
    description: "Administrative interface is reachable externally",
    metadata: { cwe: 284 },
    createdBy: user.id,
    updatedBy: user.id,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };
  const findingDates = {
    firstSeen: new Date("2026-01-02T00:00:00.000Z"),
    lastSeen: new Date("2026-01-02T00:00:00.000Z"),
    createdAt: new Date("2026-01-02T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  };
  const findingJsonDates = {
    firstSeen: "2026-01-02T00:00:00.000Z",
    lastSeen: "2026-01-02T00:00:00.000Z",
    createdAt: "2026-01-02T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
  };
  const createPayload = {
    assetId,
    title: "Exposed admin endpoint",
    severity: VulnerabilitySeverity.High,
    status: FindingStatus.Active,
    mitigation: "Restrict access to internal networks",
    weakness: { identifiers: { cwe: ["CWE-200"] } },
    affectedResource: { type: AffectedResourceType.Unspecified as const },
    vulnerabilityIds: [vulnerabilityId],
  };
  const finding: Finding = {
    id: findingId,
    assetId,
    title: createPayload.title,
    severity: createPayload.severity,
    status: createPayload.status,
    assigneeId: null,
    dueDate: null,
    mitigation: createPayload.mitigation,
    weakness: createPayload.weakness,
    affectedResource: createPayload.affectedResource,
    vulnerabilities: [vulnerability],
    observationCount: 1,
    ...findingDates,
    createdBy: user.id,
    updatedBy: user.id,
  };
  beforeEach(() => {
    vi.clearAllMocks();
    userHasPermission.mockResolvedValue(true);
  });

  it("lists nested observations with finding read permission", async () => {
    const observations = [{ id: vulnerabilityId, findingId }];
    findingService.listObservations.mockResolvedValue(observations);
    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      findingRoute: createFindingRoute(findingService, routeDependencies),
    });

    const response = await app.request(`/api/findings/${findingId}/observations`);

    expect(response.status).toBe(200);
    expect(userHasPermission).toHaveBeenCalledWith(user.id, { finding: ["read"] });
    expect(findingService.listObservations).toHaveBeenCalledWith(findingId);
    expect((await response.json()).data.items).toEqual(observations);
  });

  it("creates a nested manual observation with finding write permission", async () => {
    const observation = { id: vulnerabilityId, findingId };
    findingService.createManualObservation.mockResolvedValue({ observation, finding: {} });
    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      findingRoute: createFindingRoute(findingService, routeDependencies),
    });

    const response = await app.request(`/api/findings/${findingId}/observations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Request-Id": "request-08" },
      body: JSON.stringify({ evidence: "manual evidence" }),
    });

    expect(response.status).toBe(201);
    expect(userHasPermission).toHaveBeenCalledWith(user.id, { finding: ["write"] });
    expect(findingService.createManualObservation).toHaveBeenCalledWith({
      findingId,
      observation: { evidence: "manual evidence" },
      user,
      eventContext: { actor: user.id, correlationId: "request-08" },
    });
    expect((await response.json()).data).toEqual(observation);
  });

  it.each([
    ["POST", `/api/findings/${findingId}/observations`, { severity: "critical-ish" }],
    [
      "PUT",
      `/api/findings/${findingId}/observations/${observationId}`,
      { observedAt: "yesterday" },
    ],
  ] as const)("validates nested observation input for %s", async (method, url, body) => {
    const response = await createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      findingRoute: createFindingRoute(findingService, routeDependencies),
    }).request(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    expect(response.status).toBe(400);
    expect(findingService.createManualObservation).not.toHaveBeenCalled();
    expect(findingService.updateObservation).not.toHaveBeenCalled();
  });

  it("denies nested observation listing without finding read permission", async () => {
    userHasPermission.mockResolvedValue(false);
    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      findingRoute: createFindingRoute(findingService, routeDependencies),
    });

    const response = await app.request(`/api/findings/${findingId}/observations`);

    expect(response.status).toBe(403);
    expect(findingService.listObservations).not.toHaveBeenCalled();
  });

  it("denies nested observation creation without finding write permission", async () => {
    userHasPermission.mockResolvedValue(false);
    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      findingRoute: createFindingRoute(findingService, routeDependencies),
    });

    const response = await app.request(`/api/findings/${findingId}/observations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });

    expect(response.status).toBe(403);
    expect(findingService.createManualObservation).not.toHaveBeenCalled();
  });

  it("returns not found for nested observation access under an unknown parent", async () => {
    findingService.listObservations.mockResolvedValue(null);
    findingService.createManualObservation.mockResolvedValue(null);
    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      findingRoute: createFindingRoute(findingService, routeDependencies),
    });

    const listResponse = await app.request(`/api/findings/${findingId}/observations`);
    const createResponse = await app.request(`/api/findings/${findingId}/observations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });

    expect(listResponse.status).toBe(404);
    expect(createResponse.status).toBe(404);
  });

  it("updates a nested observation with finding write permission", async () => {
    const observation = { id: observationId, findingId, title: "Corrected observation" };
    findingService.updateObservation.mockResolvedValue({ observation, finding: {} });
    const requestId = "finding-observation-update-request";
    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      findingRoute: createFindingRoute(findingService, routeDependencies),
    });

    const response = await app.request(`/api/findings/${findingId}/observations/${observationId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "X-Request-Id": requestId },
      body: JSON.stringify({ title: "Corrected observation" }),
    });

    expect(response.status).toBe(200);
    expect(userHasPermission).toHaveBeenCalledWith(user.id, { finding: ["write"] });
    expect(findingService.updateObservation).toHaveBeenCalledWith({
      findingId,
      observationId,
      observation: { title: "Corrected observation" },
      user,
      eventContext: { actor: user.id, correlationId: requestId },
    });
    expect((await response.json()).data).toEqual(observation);
  });

  it("deletes a nested observation with finding delete permission", async () => {
    const observation = { id: observationId, findingId, title: "Deleted observation" };
    findingService.deleteObservation.mockResolvedValue({ observation, finding: {} });
    const requestId = "finding-observation-delete-request";
    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      findingRoute: createFindingRoute(findingService, routeDependencies),
    });

    const response = await app.request(`/api/findings/${findingId}/observations/${observationId}`, {
      method: "DELETE",
      headers: { "X-Request-Id": requestId },
    });

    expect(response.status).toBe(200);
    expect(userHasPermission).toHaveBeenCalledWith(user.id, { finding: ["delete"] });
    expect(findingService.deleteObservation).toHaveBeenCalledWith({
      findingId,
      observationId,
      user,
      eventContext: { actor: user.id, correlationId: requestId },
    });
    expect((await response.json()).data).toEqual(observation);
  });

  it("moves a nested observation to a selected finding with finding write permission", async () => {
    const targetFindingId = "f74d7ff2-2d81-4d1e-9fa9-73af7d46a37d";
    const observation = { id: observationId, findingId: targetFindingId };
    findingService.moveObservation.mockResolvedValue({ observation });
    const requestId = "finding-observation-move-request";
    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      findingRoute: createFindingRoute(findingService, routeDependencies),
    });

    const response = await app.request(
      `/api/findings/${findingId}/observations/${observationId}/move`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Request-Id": requestId },
        body: JSON.stringify({ targetFindingId }),
      },
    );

    expect(response.status).toBe(200);
    expect(userHasPermission).toHaveBeenCalledWith(user.id, { finding: ["write"] });
    expect(findingService.moveObservation).toHaveBeenCalledWith({
      findingId,
      observationId,
      targetFindingId,
      user,
      eventContext: { actor: user.id, correlationId: requestId },
    });
    expect((await response.json()).data).toEqual(observation);
  });

  it("rejects an invalid move target before calling the service", async () => {
    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      findingRoute: createFindingRoute(findingService, routeDependencies),
    });

    const response = await app.request(
      `/api/findings/${findingId}/observations/${observationId}/move`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetFindingId: "not-a-uuid" }),
      },
    );

    expect(response.status).toBe(400);
    expect(findingService.moveObservation).not.toHaveBeenCalled();
  });

  it("returns not found when a move cannot locate its source observation or parent", async () => {
    findingService.moveObservation.mockResolvedValue(null);
    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      findingRoute: createFindingRoute(findingService, routeDependencies),
    });

    const response = await app.request(
      `/api/findings/${findingId}/observations/${observationId}/move`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetFindingId: assigneeId }),
      },
    );

    expect(response.status).toBe(404);
  });

  it("denies observation moves without finding write permission", async () => {
    userHasPermission.mockResolvedValue(false);
    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      findingRoute: createFindingRoute(findingService, routeDependencies),
    });

    const response = await app.request(
      `/api/findings/${findingId}/observations/${observationId}/move`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetFindingId: assigneeId }),
      },
    );

    expect(response.status).toBe(403);
    expect(userHasPermission).toHaveBeenCalledWith(user.id, { finding: ["write"] });
    expect(findingService.moveObservation).not.toHaveBeenCalled();
  });

  it("returns not found for a missing nested observation update", async () => {
    findingService.updateObservation.mockResolvedValue(null);
    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      findingRoute: createFindingRoute(findingService, routeDependencies),
    });

    const response = await app.request(`/api/findings/${findingId}/observations/${observationId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Corrected observation" }),
    });

    expect(response.status).toBe(404);
    expect(userHasPermission).toHaveBeenCalledWith(user.id, { finding: ["write"] });
  });

  it("returns not found for a missing nested observation deletion", async () => {
    findingService.deleteObservation.mockResolvedValue(null);
    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      findingRoute: createFindingRoute(findingService, routeDependencies),
    });

    const response = await app.request(`/api/findings/${findingId}/observations/${observationId}`, {
      method: "DELETE",
    });

    expect(response.status).toBe(404);
    expect(userHasPermission).toHaveBeenCalledWith(user.id, { finding: ["delete"] });
  });

  it("denies nested observation updates without permission", async () => {
    userHasPermission.mockResolvedValue(false);
    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      findingRoute: createFindingRoute(findingService, routeDependencies),
    });

    const response = await app.request(`/api/findings/${findingId}/observations/${observationId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Corrected observation" }),
    });

    expect(response.status).toBe(403);
    expect(userHasPermission).toHaveBeenCalledWith(user.id, { finding: ["write"] });
    expect(findingService.updateObservation).not.toHaveBeenCalled();
  });

  it("denies nested observation deletions without permission", async () => {
    userHasPermission.mockResolvedValue(false);
    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      findingRoute: createFindingRoute(findingService, routeDependencies),
    });

    const response = await app.request(`/api/findings/${findingId}/observations/${observationId}`, {
      method: "DELETE",
    });

    expect(response.status).toBe(403);
    expect(userHasPermission).toHaveBeenCalledWith(user.id, { finding: ["delete"] });
    expect(findingService.deleteObservation).not.toHaveBeenCalled();
  });

  it("returns all findings for authenticated requests", async () => {
    const requestId = "findings-list-request";
    const findings = [finding];

    findingService.listAll.mockResolvedValue(findings);

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      findingRoute: createFindingRoute(findingService, routeDependencies),
    });

    const response = await app.request("/api/findings", {
      headers: {
        "X-Request-Id": requestId,
      },
    });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(findingService.listAll).toHaveBeenCalledOnce();
    expect(body).toEqual({
      correlationId: requestId,
      data: {
        items: [
          {
            ...findings[0],
            ...findingJsonDates,
            vulnerabilities: [
              {
                ...vulnerability,
                createdAt: "2026-01-01T00:00:00.000Z",
                updatedAt: "2026-01-01T00:00:00.000Z",
              },
            ],
          },
        ],
        totalItems: 1,
        startIndex: 0,
        currentItemCount: 1,
      },
    });
  });

  it("maps unexpected finding service failures to a generic 500 reply", async () => {
    const requestId = "findings-list-unexpected-failure-request";

    findingService.listAll.mockRejectedValueOnce(
      new ApplicationError({
        code: "finding.list_failed",
        kind: "unexpected",
        message: "failed to list findings",
      }),
    );

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      findingRoute: createFindingRoute(findingService, routeDependencies),
    });

    const response = await app.request("/api/findings", {
      headers: {
        "X-Request-Id": requestId,
      },
    });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toMatchObject({
      correlationId: requestId,
      status: 500,
      error: expect.any(String),
    });
    expect(body.error).not.toContain("finding");
    expect(body).not.toHaveProperty("reason");
    expect(body).not.toHaveProperty("details");
  });

  it("returns a finding by id", async () => {
    const requestId = "findings-get-by-id-request";
    findingService.getByID.mockResolvedValue(finding);

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      findingRoute: createFindingRoute(findingService, routeDependencies),
    });

    const response = await app.request(`/api/findings/${findingId}`, {
      headers: {
        "X-Request-Id": requestId,
      },
    });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(findingService.getByID).toHaveBeenCalledWith(findingId);
    expect(body).toEqual({
      correlationId: requestId,
      data: {
        ...finding,
        ...findingJsonDates,
        vulnerabilities: [
          {
            ...vulnerability,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    });
  });

  it("returns 404 when getting a missing finding", async () => {
    findingService.getByID.mockResolvedValue(null);

    const response = await createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      findingRoute: createFindingRoute(findingService, routeDependencies),
    }).request(`/api/findings/${findingId}`);

    expect(response.status).toBe(404);
  });

  it("returns 403 when creating a finding without write permission", async () => {
    userHasPermission.mockResolvedValue(false);

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      findingRoute: createFindingRoute(findingService, routeDependencies),
    });

    const response = await app.request("/api/findings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": "findings-create-forbidden-request",
      },
      body: JSON.stringify(createPayload),
    });

    expect(response.status).toBe(403);
    expect(userHasPermission).toHaveBeenCalledWith(user.id, {
      finding: ["write"],
    });
    expect(findingService.createManual).not.toHaveBeenCalled();
  });

  it("rejects invalid finding create bodies before calling the service", async () => {
    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      findingRoute: createFindingRoute(findingService, routeDependencies),
    });

    const response = await app.request("/api/findings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": "findings-invalid-create-body-request",
      },
      body: JSON.stringify({
        ...createPayload,
        assetId: "not-a-uuid",
      }),
    });

    expect(response.status).toBe(400);
    expect(findingService.createManual).not.toHaveBeenCalled();
  });

  it("rejects invalid finding assignee ids before calling the service", async () => {
    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      findingRoute: createFindingRoute(findingService, routeDependencies),
    });

    const response = await app.request("/api/findings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": "findings-invalid-assignee-create-body-request",
      },
      body: JSON.stringify({
        ...createPayload,
        assigneeId: "not-a-user-id",
      }),
    });

    expect(response.status).toBe(400);
    expect(findingService.createManual).not.toHaveBeenCalled();
  });

  it("rejects the removed flat finding create shape", async () => {
    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      findingRoute: createFindingRoute(findingService, routeDependencies),
    });

    const response = await app.request("/api/findings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...createPayload,
        vulnerabilityId,
        source: "manual",
        evidence: "legacy evidence",
      }),
    });

    expect(response.status).toBe(400);
    expect(findingService.createManual).not.toHaveBeenCalled();
  });

  it("links a catalog entry with finding write permission", async () => {
    const requestId = "finding-link-request";
    const linkedFinding = { id: findingId, vulnerabilities: [vulnerability] };
    findingService.linkVulnerability.mockResolvedValue({
      finding: linkedFinding,
      changed: true,
    });

    const response = await createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      findingRoute: createFindingRoute(findingService, routeDependencies),
    }).request(`/api/findings/${findingId}/vulnerabilities/${vulnerabilityId}`, {
      method: "PUT",
      headers: { "X-Request-Id": requestId },
    });

    expect(response.status).toBe(201);
    expect(userHasPermission).toHaveBeenCalledWith(user.id, { finding: ["write"] });
    expect(findingService.linkVulnerability).toHaveBeenCalledWith({
      findingId,
      vulnerabilityId,
      user,
      eventContext: { actor: user.id, correlationId: requestId },
    });
    expect(await response.json()).toMatchObject({
      data: {
        id: findingId,
        vulnerabilities: [expect.objectContaining({ id: vulnerabilityId })],
      },
    });
  });

  it("returns 200 without duplicating an existing catalog link", async () => {
    const unchangedFinding = { id: findingId, vulnerabilities: [vulnerability] };
    findingService.linkVulnerability.mockResolvedValue({
      finding: unchangedFinding,
      changed: false,
    });

    const response = await createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      findingRoute: createFindingRoute(findingService, routeDependencies),
    }).request(`/api/findings/${findingId}/vulnerabilities/${vulnerabilityId}`, { method: "PUT" });

    expect(response.status).toBe(200);
    expect(findingService.linkVulnerability).toHaveBeenCalledOnce();
  });

  it("maps a missing catalog link target to 404", async () => {
    findingService.linkVulnerability.mockRejectedValue(
      new ApplicationError({
        code: "finding.vulnerability_link_target_missing",
        kind: "missing",
        message: `vulnerability with id ${vulnerabilityId} does not exist`,
        details: { vulnerabilityId },
      }),
    );

    const response = await createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      findingRoute: createFindingRoute(findingService, routeDependencies),
    }).request(`/api/findings/${findingId}/vulnerabilities/${vulnerabilityId}`, {
      method: "PUT",
    });

    expect(response.status).toBe(404);
  });

  it("maps observation move validation errors to 400", async () => {
    findingService.moveObservation.mockRejectedValue(
      new ApplicationError({
        code: "observation.move_same_finding",
        kind: "validation",
        message: "observation already belongs to the target finding",
        details: { findingId, observationId, targetFindingId: findingId },
      }),
    );

    const response = await createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      findingRoute: createFindingRoute(findingService, routeDependencies),
    }).request(`/api/findings/${findingId}/observations/${observationId}/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetFindingId: findingId }),
    });

    expect(response.status).toBe(400);
  });

  it("unlinks a catalog entry with finding write permission", async () => {
    const unlinkedFinding = { id: findingId, vulnerabilities: [] };
    findingService.unlinkVulnerability.mockResolvedValue({
      finding: unlinkedFinding,
      changed: true,
    });

    const response = await createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      findingRoute: createFindingRoute(findingService, routeDependencies),
    }).request(`/api/findings/${findingId}/vulnerabilities/${vulnerabilityId}`, {
      method: "DELETE",
      headers: { "X-Request-Id": "finding-unlink-request" },
    });

    expect(response.status).toBe(200);
    expect(findingService.unlinkVulnerability).toHaveBeenCalledOnce();
    expect(await response.json()).toMatchObject({ data: unlinkedFinding });
  });

  it("rejects catalog links without finding write permission", async () => {
    userHasPermission.mockResolvedValue(false);

    const response = await createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      findingRoute: createFindingRoute(findingService, routeDependencies),
    }).request(`/api/findings/${findingId}/vulnerabilities/${vulnerabilityId}`, { method: "PUT" });

    expect(response.status).toBe(403);
    expect(findingService.linkVulnerability).not.toHaveBeenCalled();
  });

  it("normalizes weakness and preserves affected-resource values in a partial update", async () => {
    const requestId = "findings-update-request";
    const payload = {
      title: "Corrected title",
      weakness: { identifiers: { cwe: ["cwe-89"] } },
      affectedResource: {
        type: AffectedResourceType.SourceCode,
        repository: "https://github.com/example/repository.git",
        file: "src/query.ts",
      },
    };
    const normalizedPayload = {
      title: "Corrected title",
      weakness: { identifiers: { cwe: ["CWE-89"] } },
      affectedResource: {
        type: AffectedResourceType.SourceCode,
        repository: "https://github.com/example/repository.git",
        file: "src/query.ts",
      },
    };
    findingService.updateByID.mockResolvedValue({ id: findingId, ...normalizedPayload });

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      findingRoute: createFindingRoute(findingService, routeDependencies),
    });

    const response = await app.request(`/api/findings/${findingId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": requestId,
      },
      body: JSON.stringify(payload),
    });

    expect(response.status).toBe(200);
    expect(findingService.updateByID).toHaveBeenCalledWith({
      id: findingId,
      finding: normalizedPayload,
      user,
      eventContext: {
        actor: user.id,
        correlationId: requestId,
      },
    });
    expect(await response.json()).toEqual({
      correlationId: requestId,
      data: { id: findingId, ...normalizedPayload },
    });
  });

  it("accepts null assignee and due date values", async () => {
    const payload = { assigneeId: null, dueDate: null };
    findingService.updateByID.mockResolvedValue({ id: findingId, ...payload });

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      findingRoute: createFindingRoute(findingService, routeDependencies),
    });

    const response = await app.request(`/api/findings/${findingId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": "findings-update-null-values-request",
      },
      body: JSON.stringify(payload),
    });

    expect(response.status).toBe(200);
    expect(findingService.updateByID).toHaveBeenCalledWith(
      expect.objectContaining({ finding: payload }),
    );
  });

  it("rejects an empty update body", async () => {
    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      findingRoute: createFindingRoute(findingService, routeDependencies),
    });

    const response = await app.request(`/api/findings/${findingId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": "findings-empty-update-request",
      },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(400);
    expect(findingService.updateByID).not.toHaveBeenCalled();
  });

  it("rejects immutable finding identity updates at the route boundary", async () => {
    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      findingRoute: createFindingRoute(findingService, routeDependencies),
    });

    const response = await app.request(`/api/findings/${findingId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetId }),
    });

    expect(response.status).toBe(400);
    expect(findingService.updateByID).not.toHaveBeenCalled();
  });

  it("rejects observation-only resource fields at the route boundary", async () => {
    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      findingRoute: createFindingRoute(findingService, routeDependencies),
    });

    const response = await app.request(`/api/findings/${findingId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        affectedResource: {
          type: AffectedResourceType.WebEndpoint,
          reportedUrl: "https://example.com/admin",
        },
      }),
    });

    expect(response.status).toBe(400);
    expect(findingService.updateByID).not.toHaveBeenCalled();
  });

  it.each([
    ["assignee", `/api/findings/${findingId}`, { assigneeId: "not-a-user-id" }],
    ["finding", "/api/findings/not-a-uuid", { title: "Corrected title" }],
  ])("rejects an invalid %s id", async (_kind, url, payload) => {
    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      findingRoute: createFindingRoute(findingService, routeDependencies),
    });

    const response = await app.request(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    expect(response.status).toBe(400);
    expect(findingService.updateByID).not.toHaveBeenCalled();
  });

  it("requires finding write permission", async () => {
    userHasPermission.mockResolvedValue(false);

    const response = await createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      findingRoute: createFindingRoute(findingService, routeDependencies),
    }).request(`/api/findings/${findingId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Corrected title" }),
    });

    expect(response.status).toBe(403);
    expect(userHasPermission).toHaveBeenCalledWith(user.id, { finding: ["write"] });
    expect(findingService.updateByID).not.toHaveBeenCalled();
  });

  it("returns 404 when updating a missing finding", async () => {
    const requestId = "findings-update-not-found-request";
    const payload = { title: "Corrected title" };

    findingService.updateByID.mockResolvedValue(null);

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      findingRoute: createFindingRoute(findingService, routeDependencies),
    });

    const response = await app.request(`/api/findings/${findingId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": requestId,
      },
      body: JSON.stringify(payload),
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(findingService.updateByID).toHaveBeenCalledWith({
      id: findingId,
      finding: payload,
      user,
      eventContext: {
        actor: user.id,
        correlationId: requestId,
      },
    });
    expect(body).toEqual({
      correlationId: requestId,
      status: 404,
      error: `finding with id ${findingId} does not exist`,
    });
  });

  it("deletes a finding by id", async () => {
    const requestId = "findings-delete-request";
    const deletedFinding = finding;

    findingService.deleteByID.mockResolvedValue(deletedFinding);

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      findingRoute: createFindingRoute(findingService, routeDependencies),
    });

    const response = await app.request(`/api/findings/${findingId}`, {
      method: "DELETE",
      headers: {
        "X-Request-Id": requestId,
      },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(findingService.deleteByID).toHaveBeenCalledWith(findingId, {
      actor: user.id,
      correlationId: requestId,
    });
    expect(body).toEqual({
      correlationId: requestId,
      data: {
        ...deletedFinding,
        ...findingJsonDates,
        vulnerabilities: [
          {
            ...vulnerability,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    });
  });

  it("returns 404 when deleting a missing finding", async () => {
    const requestId = "findings-delete-not-found-request";

    findingService.deleteByID.mockResolvedValue(null);

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      findingRoute: createFindingRoute(findingService, routeDependencies),
    });

    const response = await app.request(`/api/findings/${findingId}`, {
      method: "DELETE",
      headers: {
        "X-Request-Id": requestId,
      },
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(findingService.deleteByID).toHaveBeenCalledWith(findingId, {
      actor: user.id,
      correlationId: requestId,
    });
    expect(body).toEqual({
      correlationId: requestId,
      status: 404,
      error: `finding with id ${findingId} does not exist`,
    });
  });
});
