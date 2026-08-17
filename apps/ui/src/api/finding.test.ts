import { AffectedResourceType } from "@exposurenexus/types/model/affected-resource";
import { FindingSource, FindingStatus } from "@exposurenexus/types/model/finding";
import { VulnerabilitySeverity } from "@exposurenexus/types/model/vulnerability";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createFinding,
  createFindingObservation,
  createManualFinding,
  createFindingByIDQueryOptions,
  createFindingObservationsQueryOptions,
  createFindingStatsQueryOptions,
  createListFindingsQueryOptions,
  deleteFinding,
  deleteFindingObservation,
  linkFindingVulnerability,
  unlinkFindingVulnerability,
  updateFinding,
  updateFindingObservation,
} from "@/api/finding.ts";

import type {
  CreateManualFinding,
  LegacyCreateFinding,
  Finding,
  FindingProjection,
  FindingStatistics,
  ManualObservationInput,
} from "@exposurenexus/types/model/finding";
import type { Observation, UpdateObservation } from "@exposurenexus/types/model/observation";

const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(body: object, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
    ...init,
  });
}

function requestInit(): RequestInit {
  const init = fetchMock.mock.calls[0]?.[1];
  if (!init) {
    throw new Error("fetch was not called");
  }

  return init;
}

function requestJsonBody(): unknown {
  return JSON.parse(requestInit().body as string);
}

function runQuery<T>(queryOptions: { queryFn?: unknown }): Promise<T> {
  const queryFn = queryOptions.queryFn as () => Promise<T>;

  return queryFn();
}

const userId = "1f9c36d2-1355-49d1-8464-b01ce955d88f";
const findingId = "2713d833-eb13-4517-ac7c-7761545ed42a";
const vulnerabilityId = "9d7acdd0-fad1-46c9-8218-1793f421f0fe";
const assetId = "447b53a7-c3ce-4a0c-b96a-099f5e5dc71c";
const findingJson = {
  id: findingId,
  vulnerabilityId,
  severity: VulnerabilitySeverity.High,
  status: FindingStatus.Active,
  source: FindingSource.Manual,
  evidence: "Observed exposed admin endpoint",
  mitigation: "Restrict access to internal networks",
  assigneeId: null,
  dueDate: "2026-05-06T00:00:00.000Z",
  firstSeen: "2026-01-02T00:00:00.000Z",
  lastSeen: "2026-01-03T00:00:00.000Z",
  fingerprint: "abc123",
  assetId,
  createdBy: userId,
  updatedBy: userId,
  createdAt: "2026-01-02T00:00:00.000Z",
  updatedAt: "2026-01-03T00:00:00.000Z",
  vulnerability: {
    id: vulnerabilityId,
    title: "Exposed Admin Endpoint",
    severity: VulnerabilitySeverity.High,
    description: "Administrative interface is reachable externally",
    cwe: 284,
    cve: null,
    createdBy: userId,
    updatedBy: userId,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
};
const findingProjectionJson = {
  id: findingId,
  assetId,
  title: "Exposed Admin Endpoint",
  severity: VulnerabilitySeverity.High,
  status: FindingStatus.Active,
  assigneeId: null,
  dueDate: "2026-05-06T00:00:00.000Z",
  mitigation: "Restrict access to internal networks",
  weakness: { identifiers: { cwe: ["CWE-200"] } },
  affectedResource: {
    type: "webEndpoint",
    scheme: "https",
    host: "example.com",
    port: 443,
    path: "/admin",
  },
  vulnerabilities: [],
  observationCount: 2,
  observingSources: ["manual", "nuclei"],
  firstSeen: "2026-01-02T00:00:00.000Z",
  lastSeen: "2026-01-03T00:00:00.000Z",
  createdBy: userId,
  updatedBy: userId,
  createdAt: "2026-01-02T00:00:00.000Z",
  updatedAt: "2026-01-03T00:00:00.000Z",
};
const observationJson = {
  id: "f39a0c31-33b9-4f10-a128-35158dee4a26",
  findingId,
  ingestionId: null,
  source: "manual",
  title: "Observed admin endpoint",
  description: "The endpoint answered without authentication.",
  evidence: "GET /admin returned 200",
  remediation: null,
  severity: VulnerabilitySeverity.High,
  weakness: { identifiers: { cwe: ["CWE-200"] } },
  affectedResource: {
    type: "webEndpoint",
    scheme: "https",
    host: "example.com",
    path: "/admin",
    reportedUrl: "https://example.com/admin?source=scan",
  },
  observedAt: "2026-01-03T00:00:00.000Z",
  createdBy: userId,
  updatedBy: userId,
  createdAt: "2026-01-03T00:00:00.000Z",
  updatedAt: "2026-01-03T00:00:00.000Z",
};
const createFindingPayload: LegacyCreateFinding = {
  vulnerabilityId,
  severity: VulnerabilitySeverity.High,
  status: FindingStatus.Active,
  source: FindingSource.Manual,
  evidence: "Observed exposed admin endpoint",
  mitigation: "Restrict access to internal networks",
  assetId,
};
const createManualFindingPayload: CreateManualFinding = {
  assetId,
  title: "Exposed admin endpoint",
  severity: VulnerabilitySeverity.High,
  status: FindingStatus.Active,
  assigneeId: null,
  dueDate: null,
  mitigation: "Restrict access to internal networks",
  weakness: { identifiers: {} },
  affectedResource: { type: AffectedResourceType.Unspecified },
  vulnerabilityIds: [],
  observation: {
    evidence: "GET /admin returned 200",
  },
};
const findingStats: FindingStatistics = {
  total: 2,
  status: {
    [FindingStatus.Active]: 1,
    [FindingStatus.Inactive]: 0,
    [FindingStatus.Confirmed]: 1,
    [FindingStatus.FalsePositive]: 0,
    [FindingStatus.RiskAccepted]: 0,
    [FindingStatus.Duplicate]: 0,
    [FindingStatus.OutOfScope]: 0,
    [FindingStatus.Mitigated]: 0,
  },
  severity: {
    [VulnerabilitySeverity.Info]: 0,
    [VulnerabilitySeverity.Low]: 0,
    [VulnerabilitySeverity.Medium]: 0,
    [VulnerabilitySeverity.High]: 1,
    [VulnerabilitySeverity.Critical]: 1,
  },
  source: {
    manual: 2,
  },
  assets: {
    [assetId]: 2,
  },
};

function expectFindingDates(finding: Finding) {
  expect(finding.dueDate).toBeInstanceOf(Date);
  expect(finding.firstSeen).toBeInstanceOf(Date);
  expect(finding.lastSeen).toBeInstanceOf(Date);
  expect(finding.createdAt).toBeInstanceOf(Date);
  expect(finding.updatedAt).toBeInstanceOf(Date);
  expect(finding.vulnerability.createdAt).toBeInstanceOf(Date);
  expect(finding.vulnerability.updatedAt).toBeInstanceOf(Date);
  expect(finding.dueDate?.toISOString()).toBe("2026-05-06T00:00:00.000Z");
  expect(finding.lastSeen.toISOString()).toBe("2026-01-03T00:00:00.000Z");
}

function expectProjectionDates(finding: FindingProjection) {
  expect(finding.dueDate).toBeInstanceOf(Date);
  expect(finding.firstSeen).toBeInstanceOf(Date);
  expect(finding.lastSeen).toBeInstanceOf(Date);
  expect(finding.createdAt).toBeInstanceOf(Date);
  expect(finding.updatedAt).toBeInstanceOf(Date);
  expect(finding.dueDate?.toISOString()).toBe("2026-05-06T00:00:00.000Z");
  expect(finding.lastSeen?.toISOString()).toBe("2026-01-03T00:00:00.000Z");
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("finding api", () => {
  it("creates list query options, requests findings, and parses date fields", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        correlationId: "finding-list-test",
        data: {
          items: [findingProjectionJson],
        },
      }),
    );

    const queryOptions = createListFindingsQueryOptions();
    const findings = await runQuery<Array<FindingProjection>>(queryOptions);

    expect(queryOptions.queryKey).toEqual(["findings"]);
    expect(findings).toHaveLength(1);
    expectProjectionDates(findings[0]);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/findings",
      expect.objectContaining({
        credentials: "include",
        method: "GET",
      }),
    );
  });

  it("creates detail query options, requests a finding, and parses date fields", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        correlationId: "finding-detail-test",
        data: findingProjectionJson,
      }),
    );

    const queryOptions = createFindingByIDQueryOptions(findingId);
    const finding = await runQuery<FindingProjection>(queryOptions);

    expect(queryOptions.queryKey).toEqual(["findings", findingId]);
    expectProjectionDates(finding);
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/findings/${findingId}`,
      expect.objectContaining({
        credentials: "include",
        method: "GET",
      }),
    );
  });

  it("lists nested observations with the observation schema", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: { items: [observationJson] } }));

    const query = createFindingObservationsQueryOptions(findingId);
    const observations = await runQuery<Array<Observation>>(query);

    expect(query.queryKey).toEqual(["findings", findingId, "observations"]);
    expect(observations[0].observedAt).toBeInstanceOf(Date);
    expect(observations[0].affectedResource).toMatchObject({
      type: "webEndpoint",
      reportedUrl: "https://example.com/admin?source=scan",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/findings/${findingId}/observations`,
      expect.objectContaining({ credentials: "include", method: "GET" }),
    );
  });

  it("creates a nested manual observation without adding parent or source fields", async () => {
    const input: ManualObservationInput = {
      evidence: "GET /admin returned 200",
      affectedResource: {
        type: AffectedResourceType.Package,
        ecosystem: "npm",
        name: "example-package",
        version: "1.2.3",
      },
    };
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: observationJson }));

    const observation = await createFindingObservation(findingId, input);

    expect(observation.findingId).toBe(findingId);
    expect(requestJsonBody()).toEqual(input);
    expect(requestJsonBody()).not.toHaveProperty("source");
    expect(requestJsonBody()).not.toHaveProperty("findingId");
    expect(requestJsonBody()).not.toHaveProperty("ingestionId");
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/findings/${findingId}/observations`,
      expect.objectContaining({ credentials: "include", method: "POST" }),
    );
  });

  it("updates a nested observation with only mutable fields", async () => {
    const update: UpdateObservation = {
      title: "Corrected admin endpoint",
      description: null,
      evidence: "GET /admin returned 401",
      remediation: null,
      severity: VulnerabilitySeverity.Medium,
      weakness: { identifiers: { cwe: ["CWE-89"] } },
      affectedResource: { type: AffectedResourceType.SourceCode, file: "src/query.ts" },
      observedAt: new Date("2026-01-04T00:00:00.000Z"),
    };
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ data: { ...observationJson, ...update, observedAt: update.observedAt } }),
    );

    const observation = await updateFindingObservation(findingId, observationJson.id, update);

    expect(observation.title).toBe(update.title);
    expect(observation.observedAt).toEqual(update.observedAt);
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/findings/${findingId}/observations/${observationJson.id}`,
      expect.objectContaining({ credentials: "include", method: "PUT" }),
    );
    expect(requestJsonBody()).toEqual({
      ...update,
      observedAt: update.observedAt?.toISOString(),
    });
    expect(requestJsonBody()).not.toHaveProperty("findingId");
    expect(requestJsonBody()).not.toHaveProperty("source");
    expect(requestJsonBody()).not.toHaveProperty("createdAt");
  });

  it("deletes a nested observation", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: observationJson }));

    const observation = await deleteFindingObservation(findingId, observationJson.id);

    expect(observation.id).toBe(observationJson.id);
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/findings/${findingId}/observations/${observationJson.id}`,
      expect.objectContaining({ credentials: "include", method: "DELETE" }),
    );
  });

  it("creates findings with a JSON request body", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: findingJson,
      }),
    );

    const finding = await createFinding(createFindingPayload);

    expectFindingDates(finding);
    const headers = requestInit().headers as Headers;
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/findings",
      expect.objectContaining({
        credentials: "include",
        method: "POST",
      }),
    );
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(requestJsonBody()).toEqual(createFindingPayload);
  });

  it("creates manual findings with nested observation data and parses the projection", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: findingProjectionJson,
      }),
    );

    const finding = await createManualFinding(createManualFindingPayload);

    expectProjectionDates(finding);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/findings",
      expect.objectContaining({
        credentials: "include",
        method: "POST",
      }),
    );
    expect(requestJsonBody()).toEqual(createManualFindingPayload);
  });

  it("updates findings with a mapped JSON request body", async () => {
    const update = {
      status: FindingStatus.Confirmed,
      assigneeId: "8f5f4c3b-c369-481d-98f7-cf7148d80d21",
    };
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: {
          ...findingProjectionJson,
          ...update,
        },
      }),
    );

    const updatedFinding = await updateFinding(findingId, update);

    expect(updatedFinding.status).toBe(FindingStatus.Confirmed);
    expect(updatedFinding.assigneeId).toBe("8f5f4c3b-c369-481d-98f7-cf7148d80d21");
    const headers = requestInit().headers as Headers;
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/findings/${findingId}`,
      expect.objectContaining({
        credentials: "include",
        method: "PUT",
      }),
    );
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(requestJsonBody()).toEqual(update);
    expect(requestJsonBody()).not.toHaveProperty("assetId");
    expect(requestJsonBody()).not.toHaveProperty("vulnerabilityId");
  });

  it("deletes findings", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: findingProjectionJson,
      }),
    );

    const deletedFinding = await deleteFinding(findingId);

    expectProjectionDates(deletedFinding);
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/findings/${findingId}`,
      expect.objectContaining({
        credentials: "include",
        method: "DELETE",
      }),
    );
  });

  it("links catalog entries to findings with a PUT request", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: findingProjectionJson,
      }),
    );

    const linkedFinding = await linkFindingVulnerability(findingId, vulnerabilityId);

    expectProjectionDates(linkedFinding);
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/findings/${findingId}/vulnerabilities/${vulnerabilityId}`,
      expect.objectContaining({
        credentials: "include",
        method: "PUT",
      }),
    );
  });

  it("unlinks catalog entries from findings with a DELETE request", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: findingProjectionJson,
      }),
    );

    const unlinkedFinding = await unlinkFindingVulnerability(findingId, vulnerabilityId);

    expectProjectionDates(unlinkedFinding);
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/findings/${findingId}/vulnerabilities/${vulnerabilityId}`,
      expect.objectContaining({
        credentials: "include",
        method: "DELETE",
      }),
    );
  });

  it("creates stats query options and parses finding stats", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: findingStats,
      }),
    );

    const queryOptions = createFindingStatsQueryOptions();
    const result = await runQuery<FindingStatistics>(queryOptions);

    expect(queryOptions.queryKey).toEqual(["findings", "stats"]);
    expect(result).toEqual(findingStats);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/findings/stats",
      expect.objectContaining({
        credentials: "include",
        method: "GET",
      }),
    );
  });

  it("rejects malformed finding stats replies", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: {
          ...findingStats,
          total: "2",
        },
      }),
    );

    await expect(runQuery<FindingStatistics>(createFindingStatsQueryOptions())).rejects.toThrow();
  });

  it("throws API errors from finding requests", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          error: "Finding request failed",
          reason: "invalid status",
        },
        { status: 400 },
      ),
    );

    await expect(deleteFinding(findingId)).rejects.toThrow("Finding request failed");
  });
});
