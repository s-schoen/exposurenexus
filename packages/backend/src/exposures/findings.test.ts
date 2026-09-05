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

import { ApplicationError } from "../application-error.js";
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
  const findingProjection = {
    getFindingProjectionByID: vi.fn(),
    listFindingProjections: vi.fn(),
  };
  const findingPersistence = {
    insertFinding: vi.fn(),
    lockFinding: vi.fn(),
    updateFinding: vi.fn(),
    deleteFinding: vi.fn(),
  };
  const observationPersistence = {
    listObservations: vi.fn(),
    insertObservation: vi.fn(),
    createObservationAndTouchFinding: vi.fn(),
    updateObservationAndTouchFinding: vi.fn(),
    deleteObservationAndTouchFinding: vi.fn(),
    moveObservationAndTouchFindings: vi.fn(),
  };
  const findingVulnerabilityPersistence = {
    insertLinks: vi.fn(),
    linkVulnerability: vi.fn(),
    unlinkVulnerability: vi.fn(),
  };
  const assetInventory = { getByID: vi.fn() };
  const userProfileLookup = { getByID: vi.fn() };
  const vulnerabilityPersistence = { getVulnerabilityByID: vi.fn() };
  const logger = pino({ enabled: false });
  const database = {
    transaction: () => ({
      execute: async (callback: (transaction: object) => unknown) => await callback({}),
    }),
  };

  beforeEach(() => {
    vi.resetAllMocks();
    assetInventory.getByID.mockResolvedValue({ id: assetId });
    userProfileLookup.getByID.mockResolvedValue({ id: actorId });
    vulnerabilityPersistence.getVulnerabilityByID.mockResolvedValue(vulnerability);
    findingPersistence.lockFinding.mockResolvedValue(finding);
  });

  function createCapability() {
    return createFindings({
      database: database as never,
      findingProjection,
      findingPersistence,
      observationPersistence,
      findingVulnerabilityPersistence,
      vulnerabilityPersistence,
      assetInventory,
      userProfileLookup,
      logger,
    });
  }

  it("creates a manual finding and observation with explicit audit attribution", async () => {
    const created = { ...finding, observationCount: 1 };
    findingPersistence.insertFinding.mockResolvedValue(finding);
    observationPersistence.insertObservation.mockResolvedValue(observation);
    findingVulnerabilityPersistence.insertLinks.mockResolvedValue([]);
    findingProjection.getFindingProjectionByID.mockResolvedValue(created);

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
    expect(findingPersistence.insertFinding).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ createdBy: actorId, updatedBy: actorId }),
    );
    expect(observationPersistence.insertObservation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        findingId,
        source: ObservationSource.Manual,
        createdBy: actorId,
        updatedBy: actorId,
      }),
    );
    expect(findingVulnerabilityPersistence.insertLinks).toHaveBeenCalledWith(
      expect.anything(),
      findingId,
      [vulnerabilityId],
    );
  });

  it("validates the asset before vulnerabilities and assignee", async () => {
    assetInventory.getByID.mockResolvedValue(null);

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
    expect(vulnerabilityPersistence.getVulnerabilityByID).not.toHaveBeenCalled();
    expect(userProfileLookup.getByID).not.toHaveBeenCalled();
    expect(findingPersistence.insertFinding).not.toHaveBeenCalled();
  });

  it("maps asset inventory read failures to manual finding failures", async () => {
    assetInventory.getByID.mockRejectedValue(
      new ApplicationError({
        code: "asset.get_failed",
        kind: "unexpected",
        message: "failed to get asset",
        details: { assetId },
      }),
    );

    await expect(
      createCapability().createManual({
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
      }),
    ).rejects.toMatchObject({ code: "finding.manual_create_failed", kind: "unexpected" });
  });

  it("lists and gets projected findings and only lists observations for an existing parent", async () => {
    findingProjection.listFindingProjections.mockResolvedValue([finding]);
    findingProjection.getFindingProjectionByID.mockResolvedValue(finding);
    observationPersistence.listObservations.mockResolvedValue([observation]);

    const capability = createCapability();
    await expect(capability.listAll()).resolves.toEqual([finding]);
    await expect(capability.getByID(findingId)).resolves.toBe(finding);
    await expect(capability.listObservations(findingId)).resolves.toEqual([observation]);
    expect(observationPersistence.listObservations).toHaveBeenCalledWith(
      expect.anything(),
      findingId,
    );

    findingProjection.getFindingProjectionByID.mockResolvedValueOnce(null);
    await expect(capability.listObservations(findingId)).resolves.toBeNull();
    expect(observationPersistence.listObservations).toHaveBeenCalledTimes(1);
  });

  it("defaults manual observations from the locked parent and returns both snapshots", async () => {
    const current = { ...finding, observationCount: 2 };
    const createdObservation = { ...observation, evidence: "manual evidence" };
    observationPersistence.createObservationAndTouchFinding.mockImplementation(async () => ({
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

    const input = observationPersistence.createObservationAndTouchFinding.mock.calls[0]?.[1];
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
    expect(findingProjection.getFindingProjectionByID).not.toHaveBeenCalled();
  });

  it("returns observation transition facts without emitting or re-reading", async () => {
    const currentFinding = { ...finding, updatedAt: new Date("2026-01-02T00:00:00.000Z") };
    const updatedObservation = { ...observation, title: "Corrected" };
    observationPersistence.updateObservationAndTouchFinding.mockResolvedValue({
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
    expect(findingProjection.getFindingProjectionByID).not.toHaveBeenCalled();
    expect(observationPersistence.updateObservationAndTouchFinding).toHaveBeenCalledWith(
      expect.anything(),
      {
        findingId,
        observationId,
        observation: expect.objectContaining({ updatedBy: actorId, title: "Corrected" }),
      },
    );
  });

  it("returns source and target facts for a move", async () => {
    const movedObservation = { ...observation, findingId: targetFindingId };
    observationPersistence.moveObservationAndTouchFindings.mockResolvedValue({
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
    expect(observationPersistence.moveObservationAndTouchFindings).toHaveBeenCalledWith(
      expect.anything(),
      {
        findingId,
        observationId,
        targetFindingId,
        updatedAt: expect.any(Date),
        updatedBy: actorId,
      },
    );
  });

  it("deletes observations and returns the touched parent snapshot", async () => {
    const current = { ...finding, observationCount: 0, firstSeen: null, lastSeen: null };
    observationPersistence.deleteObservationAndTouchFinding.mockResolvedValue({
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
    expect(observationPersistence.deleteObservationAndTouchFinding).toHaveBeenCalledWith(
      expect.anything(),
      {
        findingId,
        observationId,
        updatedAt: expect.any(Date),
        updatedBy: actorId,
      },
    );
  });

  it("normalizes due dates and returns finding update snapshots", async () => {
    const dueDate = new Date("2026-05-06T18:30:00.000Z");
    const current = { ...finding, dueDate: new Date("2026-05-06T00:00:00.000Z") };
    findingProjection.getFindingProjectionByID
      .mockResolvedValueOnce(finding)
      .mockResolvedValueOnce(current);
    findingPersistence.updateFinding.mockResolvedValue({ id: findingId });

    await expect(
      createCapability().updateByID({
        id: findingId,
        finding: { dueDate },
        performedBy: actorId,
      }),
    ).resolves.toEqual({ previous: finding, current, performedBy: actorId });
    expect(findingPersistence.updateFinding).toHaveBeenCalledWith(
      expect.anything(),
      findingId,
      expect.objectContaining({ dueDate: new Date("2026-05-06T00:00:00.000Z") }),
    );
  });

  it("deletes findings using the pre-delete projection", async () => {
    findingProjection.getFindingProjectionByID.mockResolvedValue(finding);
    findingPersistence.deleteFinding.mockResolvedValue({ id: findingId });

    await expect(
      createCapability().deleteByID({ id: findingId, performedBy: actorId }),
    ).resolves.toEqual({ previous: finding, performedBy: actorId });
    expect(findingPersistence.deleteFinding).toHaveBeenCalledWith(expect.anything(), findingId);
  });

  it("returns catalog link facts and preserves idempotent changes", async () => {
    findingProjection.getFindingProjectionByID.mockResolvedValue(finding);
    findingVulnerabilityPersistence.linkVulnerability.mockResolvedValue({
      link: { findingId, vulnerabilityId },
      changed: true,
    });
    findingProjection.getFindingProjectionByID
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
    findingProjection.getFindingProjectionByID
      .mockResolvedValueOnce(finding)
      .mockResolvedValueOnce(finding);
    findingVulnerabilityPersistence.unlinkVulnerability.mockResolvedValue({
      link: null,
      changed: false,
    });

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
    findingProjection.listFindingProjections.mockRejectedValue(new Error("database offline"));

    await expect(createCapability().listAll()).rejects.toMatchObject({
      code: "finding.list_failed",
      kind: "unexpected",
    });
  });
});
