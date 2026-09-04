import { AffectedResourceType } from "@exposurenexus/contracts/model/affected-resource";
import { FindingStatus, type Finding } from "@exposurenexus/contracts/model/finding";
import { ObservationSource, type Observation } from "@exposurenexus/contracts/model/observation";
import {
  VulnerabilitySeverity,
  VulnerabilityType,
  type VulnerabilityCatalog,
} from "@exposurenexus/contracts/model/vulnerability";
import { pino } from "pino";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFindings } from "./findings.js";

const actorId = "72fb3d48-4f34-4ec4-b7cd-9f68f5f4d19f";
const assetId = "447b53a7-c3ce-4a0c-b96a-099f5e5dc71c";
const findingId = "2713d833-eb13-4517-ac7c-7761545ed42a";
const targetFindingId = "f74d7ff2-2d81-4d1e-9fa9-73af7d46a37d";
const observationId = "9d7acdd0-fad1-46c9-8218-1793f421f0fe";
const vulnerabilityId = "a7d3ef96-d3b4-48bb-8386-681eb3be7b12";
const timestamp = new Date("2026-01-01T00:00:00.000Z");

const finding: Finding = {
  id: findingId,
  assetId,
  title: "Exposed endpoint",
  severity: VulnerabilitySeverity.High,
  status: FindingStatus.Active,
  assigneeId: null,
  dueDate: null,
  mitigation: null,
  weakness: { identifiers: {} },
  affectedResource: { type: AffectedResourceType.Unspecified },
  vulnerabilities: [],
  observationCount: 1,
  firstSeen: timestamp,
  lastSeen: timestamp,
  createdAt: timestamp,
  updatedAt: timestamp,
  createdBy: actorId,
  updatedBy: actorId,
};
const targetFinding: Finding = {
  ...finding,
  id: targetFindingId,
  observationCount: 0,
  firstSeen: null,
  lastSeen: null,
};
const vulnerability: VulnerabilityCatalog = {
  id: vulnerabilityId,
  type: VulnerabilityType.Custom,
  identifier: "endpoint-exposure",
  title: "Endpoint exposure",
  description: null,
  severity: VulnerabilitySeverity.High,
  metadata: null,
  createdBy: actorId,
  updatedBy: actorId,
  createdAt: timestamp,
  updatedAt: timestamp,
};
const observation: Observation = {
  id: observationId,
  findingId,
  ingestionId: null,
  source: ObservationSource.Manual,
  title: finding.title,
  description: null,
  evidence: null,
  remediation: null,
  severity: finding.severity,
  weakness: finding.weakness,
  affectedResource: finding.affectedResource,
  observedAt: timestamp,
  createdAt: timestamp,
  updatedAt: timestamp,
  createdBy: actorId,
  updatedBy: actorId,
};

describe("exposure findings", () => {
  const findingRepository = {
    createManual: vi.fn(),
    getProjectedByID: vi.fn(),
    listProjected: vi.fn(),
    updateByID: vi.fn(),
    deleteByID: vi.fn(),
    linkVulnerability: vi.fn(),
    unlinkVulnerability: vi.fn(),
  };
  const observationRepository = {
    listByFindingID: vi.fn(),
    createAndTouchFinding: vi.fn(),
    updateAndTouchFinding: vi.fn(),
    deleteAndTouchFinding: vi.fn(),
    moveAndTouchFindings: vi.fn(),
  };
  const assetRepository = { getByID: vi.fn() };
  const userProfileLookup = { getByID: vi.fn() };
  const vulnerabilityReader = { getByID: vi.fn() };
  const logger = pino({ enabled: false });

  beforeEach(() => {
    vi.resetAllMocks();
    assetRepository.getByID.mockResolvedValue({ id: assetId });
    userProfileLookup.getByID.mockResolvedValue({ id: actorId });
    vulnerabilityReader.getByID.mockResolvedValue(vulnerability);
  });

  function createCapability() {
    return createFindings({
      findingRepository,
      observationRepository,
      assetRepository,
      userProfileLookup,
      vulnerabilityReader,
      logger,
    });
  }

  it("creates a manual finding and observation with explicit audit attribution", async () => {
    const created = { ...finding, observationCount: 1 };
    findingRepository.createManual.mockResolvedValue({
      finding,
      observation,
      links: [],
      projection: created,
    });

    const result = await createCapability().createManual({
      finding: {
        assetId,
        title: finding.title,
        severity: finding.severity,
        status: finding.status,
        assigneeId: null,
        dueDate: null,
        mitigation: null,
        weakness: finding.weakness,
        affectedResource: finding.affectedResource,
        vulnerabilityIds: [vulnerabilityId],
      },
      performedBy: actorId,
    });

    expect(result).toEqual({ current: created, observation, performedBy: actorId });
    expect(findingRepository.createManual).toHaveBeenCalledWith(
      expect.objectContaining({
        finding: expect.objectContaining({
          createdBy: actorId,
          updatedBy: actorId,
        }),
        observation: expect.objectContaining({
          source: ObservationSource.Manual,
          createdBy: actorId,
          updatedBy: actorId,
        }),
        vulnerabilityIds: [vulnerabilityId],
      }),
    );
  });

  it("validates the asset before vulnerabilities and assignee", async () => {
    assetRepository.getByID.mockResolvedValue(null);

    await expect(
      createCapability().createManual({
        finding: {
          assetId,
          title: finding.title,
          severity: finding.severity,
          status: finding.status,
          assigneeId: actorId,
          dueDate: null,
          mitigation: null,
          weakness: finding.weakness,
          affectedResource: finding.affectedResource,
          vulnerabilityIds: [vulnerabilityId],
        },
        performedBy: actorId,
      }),
    ).rejects.toMatchObject({ code: "finding.asset_unknown", kind: "validation" });
    expect(vulnerabilityReader.getByID).not.toHaveBeenCalled();
    expect(userProfileLookup.getByID).not.toHaveBeenCalled();
    expect(findingRepository.createManual).not.toHaveBeenCalled();
  });

  it("lists and gets projected findings and only lists observations for an existing parent", async () => {
    findingRepository.listProjected.mockResolvedValue([finding]);
    findingRepository.getProjectedByID.mockResolvedValue(finding);
    observationRepository.listByFindingID.mockResolvedValue([observation]);

    const capability = createCapability();
    await expect(capability.listAll()).resolves.toEqual([finding]);
    await expect(capability.getByID(findingId)).resolves.toBe(finding);
    await expect(capability.listObservations(findingId)).resolves.toEqual([observation]);
    expect(observationRepository.listByFindingID).toHaveBeenCalledWith(findingId);

    findingRepository.getProjectedByID.mockResolvedValueOnce(null);
    await expect(capability.listObservations(findingId)).resolves.toBeNull();
    expect(observationRepository.listByFindingID).toHaveBeenCalledTimes(1);
  });

  it("defaults manual observations from the locked parent and returns both snapshots", async () => {
    const current = { ...finding, observationCount: 2 };
    const createdObservation = { ...observation, evidence: "manual evidence" };
    observationRepository.createAndTouchFinding.mockImplementation(async () => ({
      observation: createdObservation,
      previous: finding,
      current,
    }));

    await expect(
      createCapability().createManualObservation({
        findingId,
        observation: { evidence: "manual evidence" },
        performedBy: actorId,
      }),
    ).resolves.toEqual({
      observation: createdObservation,
      previousFinding: finding,
      currentFinding: current,
      performedBy: actorId,
    });

    const input = observationRepository.createAndTouchFinding.mock.calls[0]?.[0];
    expect(input?.buildObservation(finding)).toMatchObject({
      findingId,
      source: ObservationSource.Manual,
      title: finding.title,
      severity: finding.severity,
      weakness: finding.weakness,
      affectedResource: finding.affectedResource,
      evidence: "manual evidence",
      createdBy: actorId,
      updatedBy: actorId,
    });
    expect(findingRepository.getProjectedByID).not.toHaveBeenCalled();
  });

  it("returns observation transition facts without emitting or re-reading", async () => {
    const currentFinding = { ...finding, updatedAt: new Date("2026-01-02T00:00:00.000Z") };
    const updatedObservation = { ...observation, title: "Corrected" };
    observationRepository.updateAndTouchFinding.mockResolvedValue({
      previousObservation: observation,
      observation: updatedObservation,
      previous: finding,
      current: currentFinding,
    });

    await expect(
      createCapability().updateObservation({
        findingId,
        observationId,
        observation: { title: "Corrected" },
        performedBy: actorId,
      }),
    ).resolves.toEqual({
      previousObservation: observation,
      observation: updatedObservation,
      previousFinding: finding,
      currentFinding,
      performedBy: actorId,
    });
    expect(findingRepository.getProjectedByID).not.toHaveBeenCalled();
    expect(observationRepository.updateAndTouchFinding).toHaveBeenCalledWith({
      findingId,
      observationId,
      observation: expect.objectContaining({ updatedBy: actorId, title: "Corrected" }),
    });
  });

  it("returns source and target facts for a move", async () => {
    const movedObservation = { ...observation, findingId: targetFindingId };
    observationRepository.moveAndTouchFindings.mockResolvedValue({
      previousObservation: observation,
      observation: movedObservation,
      sourcePrevious: finding,
      sourceCurrent: { ...finding, observationCount: 0, firstSeen: null, lastSeen: null },
      targetPrevious: targetFinding,
      targetCurrent: {
        ...targetFinding,
        observationCount: 1,
        firstSeen: timestamp,
        lastSeen: timestamp,
      },
    });

    const result = await createCapability().moveObservation({
      findingId,
      observationId,
      targetFindingId,
      performedBy: actorId,
    });

    expect(result?.observation).toBe(movedObservation);
    expect(result?.sourcePrevious).toBe(finding);
    expect(result?.targetPrevious).toBe(targetFinding);
    expect(observationRepository.moveAndTouchFindings).toHaveBeenCalledWith({
      findingId,
      observationId,
      targetFindingId,
      updatedAt: expect.any(Date),
      updatedBy: actorId,
    });
  });

  it("deletes observations and returns the touched parent snapshot", async () => {
    const current = { ...finding, observationCount: 0, firstSeen: null, lastSeen: null };
    observationRepository.deleteAndTouchFinding.mockResolvedValue({
      observation,
      previous: finding,
      current,
    });

    await expect(
      createCapability().deleteObservation({ findingId, observationId, performedBy: actorId }),
    ).resolves.toEqual({
      observation,
      previousFinding: finding,
      currentFinding: current,
      performedBy: actorId,
    });
    expect(observationRepository.deleteAndTouchFinding).toHaveBeenCalledWith({
      findingId,
      observationId,
      updatedAt: expect.any(Date),
      updatedBy: actorId,
    });
  });

  it("normalizes due dates and returns finding update snapshots", async () => {
    const dueDate = new Date("2026-05-06T18:30:00.000Z");
    const current = { ...finding, dueDate: new Date("2026-05-06T00:00:00.000Z") };
    findingRepository.getProjectedByID
      .mockResolvedValueOnce(finding)
      .mockResolvedValueOnce(current);
    findingRepository.updateByID.mockResolvedValue({ id: findingId });

    await expect(
      createCapability().updateByID({
        id: findingId,
        finding: { dueDate },
        performedBy: actorId,
      }),
    ).resolves.toEqual({ previous: finding, current, performedBy: actorId });
    expect(findingRepository.updateByID).toHaveBeenCalledWith(
      findingId,
      expect.objectContaining({ dueDate: new Date("2026-05-06T00:00:00.000Z") }),
    );
  });

  it("deletes findings using the pre-delete projection", async () => {
    findingRepository.getProjectedByID.mockResolvedValue(finding);
    findingRepository.deleteByID.mockResolvedValue({ id: findingId });

    await expect(
      createCapability().deleteByID({ id: findingId, performedBy: actorId }),
    ).resolves.toEqual({ previous: finding, performedBy: actorId });
    expect(findingRepository.deleteByID).toHaveBeenCalledWith(findingId);
  });

  it("returns catalog link facts and preserves idempotent changes", async () => {
    findingRepository.getProjectedByID.mockResolvedValue(finding);
    findingRepository.linkVulnerability.mockResolvedValue({
      link: { findingId, vulnerabilityId },
      changed: true,
    });
    findingRepository.getProjectedByID
      .mockResolvedValueOnce(finding)
      .mockResolvedValueOnce(finding);

    await expect(
      createCapability().linkVulnerability({ findingId, vulnerabilityId, performedBy: actorId }),
    ).resolves.toEqual({
      finding,
      vulnerability,
      link: { findingId, vulnerabilityId },
      changed: true,
      performedBy: actorId,
    });
  });

  it("returns unchanged unlink outcomes without requiring a link event", async () => {
    findingRepository.getProjectedByID
      .mockResolvedValueOnce(finding)
      .mockResolvedValueOnce(finding);
    findingRepository.unlinkVulnerability.mockResolvedValue({ link: null, changed: false });

    await expect(
      createCapability().unlinkVulnerability({ findingId, vulnerabilityId, performedBy: actorId }),
    ).resolves.toEqual({
      finding,
      vulnerability,
      link: null,
      changed: false,
      performedBy: actorId,
    });
  });

  it("maps finding read failures to typed application errors", async () => {
    findingRepository.listProjected.mockRejectedValue(new Error("database offline"));

    await expect(createCapability().listAll()).rejects.toMatchObject({
      code: "finding.list_failed",
      kind: "unexpected",
    });
  });
});
