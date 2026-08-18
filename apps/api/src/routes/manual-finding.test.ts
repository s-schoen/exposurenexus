import { AffectedResourceType } from "@exposurenexus/types/model/affected-resource";
import { FindingStatus } from "@exposurenexus/types/model/finding";
import { ObservationSource } from "@exposurenexus/types/model/observation";
import { VulnerabilitySeverity } from "@exposurenexus/types/model/vulnerability";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createRequireDomainPermission } from "../middleware/auth.js";
import {
  annotateAuthenticatedUser,
  createTestApp,
  createTestUser,
  requireAuthenticatedUser,
} from "../test/app.js";
import { createFindingRoute } from "./findings.js";

describe("manual finding creation route", () => {
  const user = createTestUser();
  const userHasPermission = vi.fn();
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

  beforeEach(() => {
    vi.clearAllMocks();
    userHasPermission.mockResolvedValue(true);
  });

  it("passes the final finding fields and nested observation customization to the service", async () => {
    const finding = {
      id: "2713d833-eb13-4517-ac7c-7761545ed42a",
      assetId: "447b53a7-c3ce-4a0c-b96a-099f5e5dc71c",
      title: "Exposed admin panel",
      severity: VulnerabilitySeverity.High,
      status: FindingStatus.Active,
      assigneeId: null,
      dueDate: null,
      mitigation: "Restrict access",
      weakness: { identifiers: {} },
      affectedResource: { type: AffectedResourceType.Unspecified },
      vulnerabilities: [],
      observationCount: 1,
      observingSources: [ObservationSource.Manual],
      firstSeen: new Date("2026-02-03T04:05:06.000Z"),
      lastSeen: new Date("2026-02-03T04:05:06.000Z"),
      createdAt: new Date("2026-02-03T04:05:06.000Z"),
      updatedAt: new Date("2026-02-03T04:05:06.000Z"),
      createdBy: user.id,
      updatedBy: user.id,
    };
    const payload = {
      assetId: finding.assetId,
      title: finding.title,
      severity: finding.severity,
      status: finding.status,
      assigneeId: null,
      dueDate: null,
      mitigation: finding.mitigation,
      weakness: finding.weakness,
      affectedResource: finding.affectedResource,
      vulnerabilityIds: [],
      observation: {
        evidence: "GET /admin returned 200",
      },
    };
    findingService.createManual.mockResolvedValue(finding);
    const requestId = "manual-finding-create-request";

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      findingRoute: createFindingRoute(findingService, {
        requireDomainPermission: createRequireDomainPermission(userHasPermission),
      }),
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
    expect(findingService.createManual).toHaveBeenCalledWith({
      finding: payload,
      user,
      eventContext: { actor: user.id, correlationId: requestId },
    });
    expect(await response.json()).toMatchObject({ data: { id: finding.id } });
  });
});
