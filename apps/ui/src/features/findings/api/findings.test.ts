import { AffectedResourceType } from "@exposurenexus/contracts/model/affected-resource";
import { FindingStatus } from "@exposurenexus/contracts/model/finding";
import { VulnerabilitySeverity } from "@exposurenexus/contracts/model/vulnerability";
import { describe, expect, it } from "vitest";

import {
  createFindingObservation,
  createManualFinding,
  deleteFinding,
  deleteFindingObservation,
  getFindingByID,
  getFindingStats,
  linkFindingVulnerability,
  listFindingObservations,
  listFindings,
  moveFindingObservation,
  unlinkFindingVulnerability,
  updateFinding,
  updateFindingObservation,
} from "@/features/findings/api/findings.ts";
import { APIError } from "@/lib/api-client.ts";
import {
  SEED_ASSETS,
  SEED_FINDINGS,
  SEED_OBSERVATIONS,
  SEED_VULNERABILITIES,
} from "@/mocks/fixtures/index.ts";
import { captureApiCalls, mockApiError, mockApiReply } from "@/test/msw.ts";

import type { CreateManualFinding } from "@exposurenexus/contracts/model/finding";

// Happy-path requests and bodies are covered by src/mocks/handlers/handlers.test.ts, whose
// handlers validate bodies with the contracts schemas. This covers dates, nested paths, and
// error and reply handling.

const [finding] = SEED_FINDINGS;
const [observation] = SEED_OBSERVATIONS;
const [vulnerability] = SEED_VULNERABILITIES;

const createPayload: CreateManualFinding = {
  assetId: SEED_ASSETS[0].id,
  title: "Hard-coded secret",
  severity: VulnerabilitySeverity.High,
  status: FindingStatus.Active,
  assigneeId: null,
  dueDate: null,
  mitigation: null,
  weakness: { identifiers: {} },
  affectedResource: { type: AffectedResourceType.Unspecified },
  vulnerabilityIds: [],
};

describe("finding dates", () => {
  it("parses date fields of findings and observations", async () => {
    const [listed] = await listFindings();
    const fetched = await getFindingByID(finding.id);
    const [observed] = await listFindingObservations(finding.id);

    for (const value of [listed, fetched]) {
      expect(value.createdAt).toBeInstanceOf(Date);
      expect(value.dueDate).toEqual(finding.dueDate);
      expect(value.firstSeen).toEqual(finding.firstSeen);
    }
    expect(observed.observedAt).toEqual(observation.observedAt);
  });

  it("serializes due dates and observation timestamps as ISO strings", async () => {
    const calls = captureApiCalls("post", "/findings");
    const dueDate = new Date("2026-05-06T00:00:00.000Z");
    const observedAt = new Date("2026-05-01T13:45:00.000Z");

    await createManualFinding({ ...createPayload, dueDate, observation: { observedAt } });

    expect(calls[0].body).toMatchObject({
      dueDate: dueDate.toISOString(),
      observation: { observedAt: observedAt.toISOString() },
    });
  });
});

describe("finding api errors and replies", () => {
  const { id } = finding;
  it.each([
    ["list", "get", "/findings", () => listFindings()],
    ["get", "get", "/findings/:id", () => getFindingByID(id)],
    ["stats", "get", "/findings/stats", () => getFindingStats()],
    ["create", "post", "/findings", () => createManualFinding(createPayload)],
    ["update", "put", "/findings/:id", () => updateFinding(id, { title: "x" })],
    ["delete", "delete", "/findings/:id", () => deleteFinding(id)],
    [
      "link",
      "put",
      "/findings/:id/vulnerabilities/:vulnerabilityId",
      () => linkFindingVulnerability(id, vulnerability.id),
    ],
    [
      "unlink",
      "delete",
      "/findings/:id/vulnerabilities/:vulnerabilityId",
      () => unlinkFindingVulnerability(id, vulnerability.id),
    ],
    ["list observations", "get", "/findings/:id/observations", () => listFindingObservations(id)],
    [
      "add observation",
      "post",
      "/findings/:id/observations",
      () => createFindingObservation(id, { title: "x" }),
    ],
    [
      "update observation",
      "put",
      "/findings/:id/observations/:observationId",
      () => updateFindingObservation(id, observation.id, { title: "x" }),
    ],
    [
      "delete observation",
      "delete",
      "/findings/:id/observations/:observationId",
      () => deleteFindingObservation(id, observation.id),
    ],
    [
      "move observation",
      "post",
      "/findings/:id/observations/:observationId/move",
      () => moveFindingObservation(id, observation.id, SEED_FINDINGS[1].id),
    ],
  ] as const)("turns %s error replies into APIErrors", async (_name, method, path, call) => {
    mockApiError(method, path, 422, "Finding endpoint rejected the request", "finding-reason");

    const request = call();
    await expect(request).rejects.toBeInstanceOf(APIError);
    await expect(request).rejects.toMatchObject({
      statusCode: 422,
      message: "Finding endpoint rejected the request",
      reason: "finding-reason",
    });
  });

  it("rejects replies that break the finding and stats contracts", async () => {
    mockApiReply("get", "/findings/:id", { data: { ...finding, status: "open" } });
    mockApiReply("get", "/findings/stats", { data: { total: 1 } });

    await expect(getFindingByID(finding.id)).rejects.toThrow();
    await expect(getFindingStats()).rejects.toThrow();
  });
});
