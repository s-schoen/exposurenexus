import { AffectedResourceType } from "@exposurenexus/types/model/affected-resource";
import { FindingSource, FindingStatus, type Finding } from "@exposurenexus/types/model/finding";
import { VulnerabilitySeverity } from "@exposurenexus/types/model/vulnerability";
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
    create: vi.fn(),
    createManual: vi.fn(),
    updateByID: vi.fn(),
    createOrUpdate: vi.fn(),
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
    title: "Exposed Admin Endpoint",
    severity: VulnerabilitySeverity.High,
    description: "Administrative interface is reachable externally",
    cwe: 284,
    cve: null,
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
    vulnerabilityId,
    severity: VulnerabilitySeverity.High,
    status: FindingStatus.Active,
    source: FindingSource.Manual,
    evidence: "Observed exposed admin endpoint",
    mitigation: "Restrict access to internal networks",
    assetId,
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

  it.each([
    ["update", "PUT", "write", "updateObservation"],
    ["delete", "DELETE", "delete", "deleteObservation"],
  ] as const)(
    "returns not found for a missing nested observation on %s",
    async (_name, method, permission, serviceMethod) => {
      findingService[serviceMethod].mockResolvedValue(null);
      const app = createTestApp({
        annotateAuth: annotateAuthenticatedUser(user),
        requireAuth: requireAuthenticatedUser,
        findingRoute: createFindingRoute(findingService, routeDependencies),
      });

      const response = await app.request(
        `/api/findings/${findingId}/observations/${observationId}`,
        {
          method,
          ...(method === "PUT"
            ? {
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title: "Corrected observation" }),
              }
            : {}),
        },
      );

      expect(response.status).toBe(404);
      expect(userHasPermission).toHaveBeenCalledWith(user.id, { finding: [permission] });
    },
  );

  it.each([
    ["update", "PUT", "write", "updateObservation"],
    ["delete", "DELETE", "delete", "deleteObservation"],
  ] as const)(
    "denies nested observation %s without permission",
    async (_name, method, permission, serviceMethod) => {
      userHasPermission.mockResolvedValue(false);
      const app = createTestApp({
        annotateAuth: annotateAuthenticatedUser(user),
        requireAuth: requireAuthenticatedUser,
        findingRoute: createFindingRoute(findingService, routeDependencies),
      });

      const response = await app.request(
        `/api/findings/${findingId}/observations/${observationId}`,
        {
          method,
          ...(method === "PUT"
            ? {
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title: "Corrected observation" }),
              }
            : {}),
        },
      );

      expect(response.status).toBe(403);
      expect(userHasPermission).toHaveBeenCalledWith(user.id, { finding: [permission] });
      expect(findingService[serviceMethod]).not.toHaveBeenCalled();
    },
  );

  it("returns all findings for authenticated requests", async () => {
    const requestId = "findings-list-request";
    const findings = [
      {
        id: findingId,
        ...createPayload,
        assigneeId: null,
        dueDate: null,
        fingerprint: "abc123",
        ...findingDates,
        createdBy: user.id,
        updatedBy: user.id,
        vulnerability,
      },
    ];

    findingService.listAll.mockResolvedValue(findings as Finding[]);

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
            vulnerability: {
              ...vulnerability,
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
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
    const findingRecord = {
      id: findingId,
      ...createPayload,
      assigneeId: null,
      dueDate: null,
      fingerprint: "abc123",
      ...findingDates,
      createdBy: user.id,
      updatedBy: user.id,
      vulnerability,
    };

    findingService.getByID.mockResolvedValue(findingRecord as Finding);

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
        ...findingRecord,
        ...findingJsonDates,
        vulnerability: {
          ...vulnerability,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      },
    });
  });

  it("passes the authenticated user into finding creation", async () => {
    const requestId = "findings-create-request";
    const createdFinding = {
      id: findingId,
      ...createPayload,
      assigneeId: null,
      dueDate: null,
      fingerprint: "abc123",
      ...findingDates,
      createdBy: user.id,
      updatedBy: user.id,
      vulnerability,
    };

    findingService.create.mockResolvedValue(createdFinding as Finding);

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      findingRoute: createFindingRoute(findingService, routeDependencies),
    });

    const response = await app.request("/api/findings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": requestId,
      },
      body: JSON.stringify(createPayload),
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(findingService.create).toHaveBeenCalledWith({
      finding: createPayload,
      user,
      eventContext: {
        actor: user.id,
        correlationId: requestId,
      },
    });
    expect(body).toEqual({
      correlationId: requestId,
      data: {
        ...createdFinding,
        ...findingJsonDates,
        vulnerability: {
          ...vulnerability,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      },
    });
  });

  it("maps finding creation validation failures through the error handler", async () => {
    const requestId = "findings-create-validation-failure-request";

    findingService.create.mockRejectedValueOnce(
      new ApplicationError({
        code: "finding.asset_unknown",
        kind: "validation",
        message: "finding asset does not exist",
        details: { assetId },
      }),
    );

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      findingRoute: createFindingRoute(findingService, routeDependencies),
    });

    const response = await app.request("/api/findings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": requestId,
      },
      body: JSON.stringify(createPayload),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({
      correlationId: requestId,
      status: 400,
      error: expect.any(String),
    });
    expect(body).not.toHaveProperty("reason");
    expect(body).not.toHaveProperty("details");
  });

  it("accepts nullable assignee identity during finding creation", async () => {
    const requestId = "findings-create-with-assignee-request";
    const payload = {
      ...createPayload,
      assigneeId,
    };
    const createdFinding = {
      id: findingId,
      ...payload,
      fingerprint: "abc123",
      ...findingDates,
      createdBy: user.id,
      updatedBy: user.id,
      vulnerability,
    };

    findingService.create.mockResolvedValue(createdFinding as Finding);

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      findingRoute: createFindingRoute(findingService, routeDependencies),
    });

    const response = await app.request("/api/findings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": requestId,
      },
      body: JSON.stringify(payload),
    });

    expect(response.status).toBe(201);
    expect(findingService.create).toHaveBeenCalledWith({
      finding: payload,
      user,
      eventContext: {
        actor: user.id,
        correlationId: requestId,
      },
    });
  });

  it("accepts null assignee identity during finding creation", async () => {
    const payload = {
      ...createPayload,
      assigneeId: null,
    };
    const createdFinding = {
      id: findingId,
      ...payload,
      fingerprint: "abc123",
      ...findingDates,
      createdBy: user.id,
      updatedBy: user.id,
      vulnerability,
    };

    findingService.create.mockResolvedValue(createdFinding as Finding);

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      findingRoute: createFindingRoute(findingService, routeDependencies),
    });

    const response = await app.request("/api/findings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": "findings-create-with-null-assignee-request",
      },
      body: JSON.stringify(payload),
    });

    expect(response.status).toBe(201);
    expect(findingService.create).toHaveBeenCalledWith({
      finding: payload,
      user,
      eventContext: {
        actor: user.id,
        correlationId: "findings-create-with-null-assignee-request",
      },
    });
  });

  it("accepts and normalizes due dates during finding creation", async () => {
    const payload = {
      ...createPayload,
      dueDate: "2026-05-06T18:30:00.000Z",
    };
    const normalizedDueDate = new Date("2026-05-06T00:00:00.000Z");
    const createdFinding = {
      id: findingId,
      ...createPayload,
      assigneeId: null,
      dueDate: normalizedDueDate,
      fingerprint: "abc123",
      ...findingDates,
      createdBy: user.id,
      updatedBy: user.id,
      vulnerability,
    };

    findingService.create.mockResolvedValue(createdFinding as Finding);

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      findingRoute: createFindingRoute(findingService, routeDependencies),
    });

    const response = await app.request("/api/findings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": "findings-create-with-due-date-request",
      },
      body: JSON.stringify(payload),
    });

    expect(response.status).toBe(201);
    expect(findingService.create).toHaveBeenCalledWith({
      finding: {
        ...createPayload,
        dueDate: normalizedDueDate,
      },
      user,
      eventContext: {
        actor: user.id,
        correlationId: "findings-create-with-due-date-request",
      },
    });
  });

  it("accepts null due dates during finding creation", async () => {
    const payload = {
      ...createPayload,
      dueDate: null,
    };
    const createdFinding = {
      id: findingId,
      ...payload,
      assigneeId: null,
      fingerprint: "abc123",
      ...findingDates,
      createdBy: user.id,
      updatedBy: user.id,
      vulnerability,
    };

    findingService.create.mockResolvedValue(createdFinding as Finding);

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      findingRoute: createFindingRoute(findingService, routeDependencies),
    });

    const response = await app.request("/api/findings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": "findings-create-with-null-due-date-request",
      },
      body: JSON.stringify(payload),
    });

    expect(response.status).toBe(201);
    expect(findingService.create).toHaveBeenCalledWith({
      finding: payload,
      user,
      eventContext: {
        actor: user.id,
        correlationId: "findings-create-with-null-due-date-request",
      },
    });
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
    expect(findingService.create).not.toHaveBeenCalled();
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
    expect(findingService.create).not.toHaveBeenCalled();
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
    expect(findingService.create).not.toHaveBeenCalled();
  });

  it("links a catalog entry with finding write permission", async () => {
    const requestId = "finding-link-request";
    const findingProjection = { id: findingId, vulnerabilities: [vulnerability] };
    findingService.linkVulnerability.mockResolvedValue({
      finding: findingProjection,
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
    const findingProjection = { id: findingId, vulnerabilities: [vulnerability] };
    findingService.linkVulnerability.mockResolvedValue({
      finding: findingProjection,
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

  it("unlinks a catalog entry with finding write permission", async () => {
    const findingProjection = { id: findingId, vulnerabilities: [] };
    findingService.unlinkVulnerability.mockResolvedValue({
      finding: findingProjection,
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
    expect(await response.json()).toMatchObject({ data: findingProjection });
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

  it("accepts and normalizes a partial finding update", async () => {
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
        repository: "github.com/example/repository",
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

  it.each([
    ["assetId", { assetId }],
    ["createdAt", { createdAt: "2026-01-02T00:00:00.000Z" }],
    ["observationCount", { observationCount: 1 }],
    ["vulnerabilities", { vulnerabilities: [] }],
    [
      "reportedUrl",
      {
        affectedResource: {
          type: AffectedResourceType.WebEndpoint,
          reportedUrl: "https://example.com/admin",
        },
      },
    ],
    [
      "revision",
      { affectedResource: { type: AffectedResourceType.SourceCode, revision: "abc123" } },
    ],
    ["version", { affectedResource: { type: AffectedResourceType.Package, version: "1.0.0" } }],
    ["tag", { affectedResource: { type: AffectedResourceType.ContainerImage, tag: "latest" } }],
    [
      "displayName",
      {
        affectedResource: {
          type: AffectedResourceType.CloudResource,
          displayName: "Production bucket",
        },
      },
    ],
  ])("rejects immutable or observation-only %s updates", async (_field, payload) => {
    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      findingRoute: createFindingRoute(findingService, routeDependencies),
    });

    const response = await app.request(`/api/findings/${findingId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
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
    const deletedFinding = {
      id: findingId,
      ...createPayload,
      assigneeId: null,
      dueDate: null,
      fingerprint: "abc123",
      ...findingDates,
      createdBy: user.id,
      updatedBy: user.id,
      vulnerability,
    };

    findingService.deleteByID.mockResolvedValue(deletedFinding as Finding);

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
        vulnerability: {
          ...vulnerability,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
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
