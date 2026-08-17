import { AffectedResourceType } from "@exposurenexus/types/model/affected-resource";
import { FindingStatus, type FindingProjection } from "@exposurenexus/types/model/finding";
import { ObservationSource, type Observation } from "@exposurenexus/types/model/observation";
import { VulnerabilitySeverity } from "@exposurenexus/types/model/vulnerability";
import { pino } from "pino";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestUser } from "../test/app.js";
import { createDomainEventCollector } from "../test/eventbus.js";
import { createFindingService } from "./finding.js";

const user = createTestUser();
const findingId = "2713d833-eb13-4517-ac7c-7761545ed42a";
const observationId = "9d7acdd0-fad1-46c9-8218-1793f421f0fe";
const oldTime = new Date("2026-08-16T10:00:00.000Z");
const now = new Date("2026-08-17T10:00:00.000Z");

const previousFinding: FindingProjection = {
  id: findingId,
  assetId: "447b53a7-c3ce-4a0c-b96a-099f5e5dc71c",
  title: "Canonical title",
  severity: VulnerabilitySeverity.High,
  status: FindingStatus.Active,
  assigneeId: null,
  dueDate: null,
  mitigation: null,
  weakness: { identifiers: { cwe: ["CWE-200"] } },
  affectedResource: { type: AffectedResourceType.Unspecified },
  vulnerabilities: [],
  observationCount: 1,
  observingSources: [ObservationSource.Nuclei],
  firstSeen: oldTime,
  lastSeen: oldTime,
  createdAt: oldTime,
  updatedAt: oldTime,
  createdBy: user.id,
  updatedBy: user.id,
};

describe("nested manual observations", () => {
  const findingRepository = {
    list: vi.fn(),
    getByID: vi.fn(),
    getByFingerprint: vi.fn(),
    create: vi.fn(),
    updateByID: vi.fn(),
    deleteByID: vi.fn(),
    countBy: vi.fn(),
  };
  const findingPersistenceRepository = {
    listProjected: vi.fn(),
    getProjectedByID: vi.fn(),
    updateByID: vi.fn(),
    deleteByID: vi.fn(),
  };
  const observationRepository = {
    listByFindingID: vi.fn(),
    createAndTouchFinding: vi.fn(),
    updateAndTouchFinding: vi.fn(),
    deleteAndTouchFinding: vi.fn(),
    moveAndTouchFindings: vi.fn(),
  };
  const domainEvents = createDomainEventCollector();

  beforeEach(() => {
    vi.clearAllMocks();
    domainEvents.clear();
    vi.useRealTimers();
    findingPersistenceRepository.getProjectedByID.mockResolvedValue(previousFinding);
  });

  function createService() {
    return createFindingService({
      findingRepository,
      findingPersistenceRepository,
      observationRepository,
      assetService: { getByID: vi.fn() },
      userProfileService: { getByID: vi.fn() },
      vulnerabilityService: { getByID: vi.fn() },
      domainEventEmitter: domainEvents.emitter,
      logger: pino({ enabled: false }),
    });
  }

  it("lists only observations owned by an existing parent finding", async () => {
    const observations = [{ id: observationId }] as Observation[];
    observationRepository.listByFindingID.mockResolvedValue(observations);

    await expect(createService().listObservations(findingId)).resolves.toBe(observations);
    expect(observationRepository.listByFindingID).toHaveBeenCalledWith(findingId);

    findingPersistenceRepository.getProjectedByID.mockResolvedValueOnce(null);
    await expect(createService().listObservations(findingId)).resolves.toBeNull();
    expect(observationRepository.listByFindingID).toHaveBeenCalledOnce();
  });

  it("defaults from one timestamp and parent snapshot without changing canonical identity", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const createdObservation = {
      id: observationId,
      findingId,
      ingestionId: null,
      source: ObservationSource.Manual,
      title: previousFinding.title,
      description: null,
      evidence: "manual evidence",
      remediation: null,
      severity: previousFinding.severity,
      weakness: previousFinding.weakness,
      affectedResource: previousFinding.affectedResource,
      observedAt: now,
      createdAt: now,
      updatedAt: now,
      createdBy: user.id,
      updatedBy: user.id,
    } satisfies Observation;
    const currentFinding = {
      ...previousFinding,
      observationCount: 2,
      observingSources: [ObservationSource.Manual, ObservationSource.Nuclei],
      lastSeen: now,
      updatedAt: now,
    } satisfies FindingProjection;
    const lockedPreviousFinding = {
      ...previousFinding,
      title: "Locked canonical title",
      severity: VulnerabilitySeverity.Medium,
    } satisfies FindingProjection;
    const createdFromLockedFinding = {
      ...createdObservation,
      title: lockedPreviousFinding.title,
      severity: lockedPreviousFinding.severity,
    } satisfies Observation;
    observationRepository.createAndTouchFinding.mockImplementation(async (input) => ({
      observation: { id: observationId, ...input.buildObservation(lockedPreviousFinding) },
      previous: lockedPreviousFinding,
      current: currentFinding,
    }));

    await expect(
      createService().createManualObservation({
        findingId,
        observation: { evidence: "manual evidence" },
        user,
        eventContext: { actor: user.id, correlationId: "request-08" },
      }),
    ).resolves.toEqual({ observation: createdFromLockedFinding, finding: currentFinding });

    expect(observationRepository.createAndTouchFinding).toHaveBeenCalledWith({
      findingId,
      buildObservation: expect.any(Function),
    });
    expect(findingPersistenceRepository.getProjectedByID).not.toHaveBeenCalled();
    expect(domainEvents.subjects()).toEqual(["observation.created", "finding.updated"]);
    expect(domainEvents.events).toMatchObject([
      {
        data: { observation: createdFromLockedFinding },
        actor: user.id,
        correlationId: "request-08",
      },
      {
        data: { previous: lockedPreviousFinding, current: currentFinding },
        actor: user.id,
        correlationId: "request-08",
      },
    ]);
    expect(createdFromLockedFinding).toMatchObject({
      title: "Locked canonical title",
      severity: VulnerabilitySeverity.Medium,
      weakness: lockedPreviousFinding.weakness,
      affectedResource: lockedPreviousFinding.affectedResource,
      observedAt: now,
    });
  });

  it("keeps supplied observation snapshots observation-owned", async () => {
    const supplied = {
      title: "Source title",
      severity: VulnerabilitySeverity.Low,
      weakness: { identifiers: { custom: ["manual-check"] } },
      affectedResource: { type: AffectedResourceType.Asset as const },
      observedAt: oldTime,
    };
    observationRepository.createAndTouchFinding.mockImplementation(async (input) => ({
      observation: { id: observationId, ...input.buildObservation(previousFinding) },
      previous: previousFinding,
      current: { ...previousFinding, updatedAt: now },
    }));

    await createService().createManualObservation({ findingId, observation: supplied, user });

    const input = observationRepository.createAndTouchFinding.mock.calls[0]?.[0];
    expect(input?.buildObservation(previousFinding)).toMatchObject(supplied);
    expect(findingPersistenceRepository.updateByID).not.toHaveBeenCalled();
  });

  it("returns null when the transaction reports that the locked parent does not exist", async () => {
    observationRepository.createAndTouchFinding.mockResolvedValue(null);

    await expect(
      createService().createManualObservation({ findingId, observation: {}, user }),
    ).resolves.toBeNull();
    expect(observationRepository.createAndTouchFinding).toHaveBeenCalledOnce();
    expect(findingPersistenceRepository.getProjectedByID).not.toHaveBeenCalled();
    expect(domainEvents.subjects()).toEqual([]);
  });

  it("emits no events when the transactional mutation rejects", async () => {
    observationRepository.createAndTouchFinding.mockRejectedValue(
      new Error("current projection failed"),
    );

    await expect(
      createService().createManualObservation({ findingId, observation: {}, user }),
    ).rejects.toMatchObject({ code: "observation.create_failed" });

    expect(domainEvents.subjects()).toEqual([]);
  });

  it("emits observation then finding events only after the transaction resolves", async () => {
    const observation = {
      id: observationId,
      findingId,
      ingestionId: null,
      source: ObservationSource.Manual,
      title: previousFinding.title,
      description: null,
      evidence: null,
      remediation: null,
      severity: previousFinding.severity,
      weakness: previousFinding.weakness,
      affectedResource: previousFinding.affectedResource,
      observedAt: now,
      createdAt: now,
      updatedAt: now,
      createdBy: user.id,
      updatedBy: user.id,
    } satisfies Observation;
    const current = { ...previousFinding, observationCount: 2 };
    let resolveTransaction!: () => void;
    observationRepository.createAndTouchFinding.mockReturnValue(
      new Promise((resolve) => {
        resolveTransaction = () => resolve({ observation, previous: previousFinding, current });
      }),
    );

    const creation = createService().createManualObservation({
      findingId,
      observation: {},
      user,
    });

    expect(domainEvents.subjects()).toEqual([]);
    resolveTransaction();
    await creation;
    expect(domainEvents.subjects()).toEqual(["observation.created", "finding.updated"]);
  });

  it("updates an observation and emits updated snapshots after the transaction", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const previousObservation = {
      id: observationId,
      findingId,
      ingestionId: null,
      source: ObservationSource.Nuclei,
      title: "Source title",
      description: null,
      evidence: "Sensitive source evidence",
      remediation: null,
      severity: VulnerabilitySeverity.High,
      weakness: { identifiers: { cwe: ["CWE-200"] } },
      affectedResource: { type: AffectedResourceType.WebEndpoint, path: "/admin" },
      observedAt: oldTime,
      createdAt: oldTime,
      updatedAt: oldTime,
      createdBy: user.id,
      updatedBy: user.id,
    } satisfies Observation;
    const currentObservation = {
      ...previousObservation,
      title: "Corrected source title",
      evidence: "Corrected evidence",
      weakness: { identifiers: { cwe: ["CWE-89"] } },
      affectedResource: { type: AffectedResourceType.SourceCode, file: "src/query.ts" },
      observedAt: now,
      updatedAt: now,
      updatedBy: user.id,
    } satisfies Observation;
    const currentFinding = {
      ...previousFinding,
      updatedAt: now,
      updatedBy: user.id,
      lastSeen: now,
    } satisfies FindingProjection;
    observationRepository.updateAndTouchFinding.mockResolvedValue({
      previousObservation,
      observation: currentObservation,
      previous: previousFinding,
      current: currentFinding,
    });

    await expect(
      createService().updateObservation({
        findingId,
        observationId,
        observation: {
          title: currentObservation.title,
          evidence: currentObservation.evidence,
          weakness: currentObservation.weakness,
          affectedResource: currentObservation.affectedResource,
          observedAt: now,
        },
        user,
        eventContext: { actor: user.id, correlationId: "request-09-update" },
      }),
    ).resolves.toEqual({ observation: currentObservation, finding: currentFinding });

    expect(observationRepository.updateAndTouchFinding).toHaveBeenCalledWith({
      findingId,
      observationId,
      observation: expect.objectContaining({
        title: currentObservation.title,
        evidence: currentObservation.evidence,
        weakness: currentObservation.weakness,
        affectedResource: currentObservation.affectedResource,
        observedAt: now,
        updatedAt: now,
        updatedBy: user.id,
      }),
    });
    expect(domainEvents.subjects()).toEqual(["observation.updated", "finding.updated"]);
    expect(domainEvents.events).toMatchObject([
      {
        data: { previous: previousObservation, current: currentObservation },
        actor: user.id,
        correlationId: "request-09-update",
      },
      {
        data: { previous: previousFinding, current: currentFinding },
        actor: user.id,
        correlationId: "request-09-update",
      },
    ]);
  });

  it("deletes an observation, touches its parent, and emits events after the transaction", async () => {
    const deletedObservation = {
      id: observationId,
      findingId,
      ingestionId: null,
      source: ObservationSource.Manual,
      title: "Final manual observation",
      description: null,
      evidence: "Sensitive source evidence",
      remediation: null,
      severity: VulnerabilitySeverity.High,
      weakness: { identifiers: {} },
      affectedResource: { type: AffectedResourceType.Unspecified },
      observedAt: oldTime,
      createdAt: oldTime,
      updatedAt: oldTime,
      createdBy: user.id,
      updatedBy: user.id,
    } satisfies Observation;
    const emptyFinding = {
      ...previousFinding,
      observationCount: 0,
      observingSources: [],
      firstSeen: null,
      lastSeen: null,
      updatedAt: now,
      updatedBy: user.id,
    } satisfies FindingProjection;
    observationRepository.deleteAndTouchFinding.mockResolvedValue({
      observation: deletedObservation,
      previous: previousFinding,
      current: emptyFinding,
    });

    await expect(
      createService().deleteObservation({
        findingId,
        observationId,
        user,
        eventContext: { actor: user.id, correlationId: "request-09-delete" },
      }),
    ).resolves.toEqual({ observation: deletedObservation, finding: emptyFinding });

    expect(observationRepository.deleteAndTouchFinding).toHaveBeenCalledWith({
      findingId,
      observationId,
      updatedAt: expect.any(Date),
      updatedBy: user.id,
    });
    expect(domainEvents.subjects()).toEqual(["observation.deleted", "finding.updated"]);
    expect(domainEvents.events).toMatchObject([
      {
        data: { observation: deletedObservation },
        actor: user.id,
        correlationId: "request-09-delete",
      },
      {
        data: { previous: previousFinding, current: emptyFinding },
        actor: user.id,
        correlationId: "request-09-delete",
      },
    ]);
  });

  it("does not emit events when an observation mutation transaction fails", async () => {
    observationRepository.updateAndTouchFinding.mockRejectedValue(new Error("transaction failed"));

    await expect(
      createService().updateObservation({
        findingId,
        observationId,
        observation: { title: "Corrected title" },
        user,
      }),
    ).rejects.toMatchObject({ code: "observation.update_failed" });

    expect(domainEvents.subjects()).toEqual([]);
  });

  it("moves an observation and emits source, target, and moved events after the transaction", async () => {
    const targetFindingId = "f74d7ff2-2d81-4d1e-9fa9-73af7d46a37d";
    const targetFinding = {
      ...previousFinding,
      id: targetFindingId,
      title: "Target finding",
      observationCount: 0,
      observingSources: [],
      firstSeen: null,
      lastSeen: null,
    } satisfies FindingProjection;
    const movedObservation = {
      id: observationId,
      findingId: targetFindingId,
      ingestionId: null,
      source: ObservationSource.Manual,
      title: "Moved observation",
      description: null,
      evidence: "Evidence",
      remediation: null,
      severity: VulnerabilitySeverity.High,
      weakness: { identifiers: {} },
      affectedResource: { type: AffectedResourceType.Asset },
      observedAt: now,
      createdAt: oldTime,
      updatedAt: now,
      createdBy: user.id,
      updatedBy: user.id,
    } satisfies Observation;
    const sourceCurrent = {
      ...previousFinding,
      observationCount: 0,
      observingSources: [],
      firstSeen: null,
      lastSeen: null,
      updatedAt: now,
      updatedBy: user.id,
    } satisfies FindingProjection;
    const targetCurrent = {
      ...targetFinding,
      observationCount: 1,
      observingSources: [ObservationSource.Manual],
      firstSeen: now,
      lastSeen: now,
      updatedAt: now,
      updatedBy: user.id,
    } satisfies FindingProjection;
    let resolveTransaction!: () => void;
    observationRepository.moveAndTouchFindings.mockReturnValue(
      new Promise((resolve) => {
        resolveTransaction = () =>
          resolve({
            previousObservation: { ...movedObservation, findingId },
            observation: movedObservation,
            sourcePrevious: previousFinding,
            sourceCurrent,
            targetPrevious: targetFinding,
            targetCurrent,
          });
      }),
    );

    const moving = createService().moveObservation({
      findingId,
      observationId,
      targetFindingId,
      user,
      eventContext: { actor: user.id, correlationId: "request-10" },
    });

    expect(domainEvents.subjects()).toEqual([]);
    resolveTransaction();
    await expect(moving).resolves.toEqual({
      observation: movedObservation,
      sourceFinding: sourceCurrent,
      targetFinding: targetCurrent,
    });
    expect(observationRepository.moveAndTouchFindings).toHaveBeenCalledWith({
      findingId,
      observationId,
      targetFindingId,
      updatedAt: expect.any(Date),
      updatedBy: user.id,
    });
    expect(domainEvents.subjects()).toEqual([
      "observation.moved",
      "finding.updated",
      "finding.updated",
    ]);
    expect(domainEvents.events).toMatchObject([
      {
        data: {
          previous: { id: observationId, findingId },
          current: movedObservation,
        },
        actor: user.id,
        correlationId: "request-10",
      },
      {
        data: { previous: previousFinding, current: sourceCurrent },
        actor: user.id,
        correlationId: "request-10",
      },
      {
        data: { previous: targetFinding, current: targetCurrent },
        actor: user.id,
        correlationId: "request-10",
      },
    ]);
  });

  it("rejects moving an observation to its current parent without touching the repository", async () => {
    await expect(
      createService().moveObservation({
        findingId,
        observationId,
        targetFindingId: findingId,
        user,
      }),
    ).rejects.toMatchObject({ code: "observation.move_same_finding" });

    expect(observationRepository.moveAndTouchFindings).not.toHaveBeenCalled();
    expect(domainEvents.subjects()).toEqual([]);
  });

  it("does not emit moved or parent events when the move transaction fails", async () => {
    observationRepository.moveAndTouchFindings.mockRejectedValue(new Error("transaction failed"));

    await expect(
      createService().moveObservation({
        findingId,
        observationId,
        targetFindingId: "f74d7ff2-2d81-4d1e-9fa9-73af7d46a37d",
        user,
      }),
    ).rejects.toMatchObject({ code: "observation.move_failed" });

    expect(domainEvents.subjects()).toEqual([]);
  });
});
