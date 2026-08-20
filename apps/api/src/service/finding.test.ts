import { AffectedResourceType } from "@exposurenexus/types/model/affected-resource";
import { FindingStatus, type Finding } from "@exposurenexus/types/model/finding";
import { VulnerabilitySeverity, VulnerabilityType } from "@exposurenexus/types/model/vulnerability";
import { pino } from "pino";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestUser } from "../test/app.js";
import { createDomainEventCollector } from "../test/eventbus.js";
import { createFindingService } from "./finding.js";

import type { ApplicationError } from "./application-error.js";

describe("finding service", () => {
  const user = createTestUser();
  const assigneeId = "f74d7ff2-2d81-4d1e-9fa9-73af7d46a37d";
  const logger = pino({ enabled: false });
  const findingRepository = {
    createManual: vi.fn(),
    listProjected: vi.fn(),
    getProjectedByID: vi.fn(),
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
  const vulnerabilityService = { getByID: vi.fn() };
  const assetService = { getByID: vi.fn() };
  const userProfileService = { getByID: vi.fn() };
  const domainEvents = createDomainEventCollector();
  const vulnerability = {
    id: "9d7acdd0-fad1-46c9-8218-1793f421f0fe",
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
  const baseFinding: Finding = {
    id: "2713d833-eb13-4517-ac7c-7761545ed42a",
    assetId: "447b53a7-c3ce-4a0c-b96a-099f5e5dc71c",
    title: "Exposed admin endpoint",
    severity: VulnerabilitySeverity.High,
    status: FindingStatus.Active,
    assigneeId: null,
    dueDate: null,
    mitigation: "Restrict access to trusted networks",
    weakness: { identifiers: { cwe: ["CWE-200"], nuclei: ["admin-panel"] } },
    affectedResource: {
      type: AffectedResourceType.WebEndpoint,
      scheme: "https",
      host: "example.com",
      port: 443,
      path: "/admin",
    },
    vulnerabilities: [vulnerability],
    observationCount: 2,
    firstSeen: new Date("2026-01-02T00:00:00.000Z"),
    lastSeen: new Date("2026-01-03T00:00:00.000Z"),
    createdAt: new Date("2026-01-02T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    createdBy: user.id,
    updatedBy: user.id,
  };

  function createService() {
    return createFindingService({
      findingRepository,
      observationRepository,
      assetService,
      userProfileService,
      vulnerabilityService,
      domainEventEmitter: domainEvents.emitter,
      logger,
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    domainEvents.clear();
  });

  it("lists final findings without catalog lookups", async () => {
    findingRepository.listProjected.mockResolvedValue([baseFinding]);

    await expect(createService().listAll()).resolves.toEqual([baseFinding]);
    expect(findingRepository.listProjected).toHaveBeenCalledOnce();
    expect(vulnerabilityService.getByID).not.toHaveBeenCalled();
  });

  it("gets a final finding by id", async () => {
    findingRepository.getProjectedByID.mockResolvedValue(baseFinding);

    await expect(createService().getByID(baseFinding.id)).resolves.toBe(baseFinding);
    expect(findingRepository.getProjectedByID).toHaveBeenCalledWith(baseFinding.id);
  });

  it("maps finding lookup failures to an application error", async () => {
    findingRepository.getProjectedByID.mockRejectedValue(new Error("db offline"));

    await expect(createService().getByID(baseFinding.id)).rejects.toMatchObject({
      code: "finding.get_failed",
      kind: "unexpected",
      details: { findingId: baseFinding.id },
    } satisfies Partial<ApplicationError>);
  });

  it("corrects finding-owned fields and emits complete finding snapshots", async () => {
    const now = new Date("2026-03-04T05:06:07.000Z");
    const correction = {
      title: "Corrected admin endpoint",
      weakness: { identifiers: { cwe: ["CWE-89"] } },
      affectedResource: {
        type: AffectedResourceType.SourceCode as const,
        repository: "github.com/example/repository",
        file: "src/query.ts",
      },
    };
    const current = { ...baseFinding, ...correction, updatedAt: now, updatedBy: user.id };
    vi.useFakeTimers();
    vi.setSystemTime(now);
    findingRepository.getProjectedByID
      .mockResolvedValueOnce(baseFinding)
      .mockResolvedValueOnce(current);
    findingRepository.updateByID.mockResolvedValue({ id: baseFinding.id });

    await expect(
      createService().updateByID({
        id: baseFinding.id,
        finding: correction,
        user,
        eventContext: { actor: user.id, correlationId: "finding-correction" },
      }),
    ).resolves.toEqual(current);

    expect(findingRepository.updateByID).toHaveBeenCalledWith(baseFinding.id, {
      ...correction,
      updatedAt: now,
      updatedBy: user.id,
    });
    expect(domainEvents.events[0]).toMatchObject({
      subject: "finding.updated",
      actor: user.id,
      correlationId: "finding-correction",
      data: { previous: baseFinding, current },
    });
  });

  it("normalizes and clears due dates from partial updates", async () => {
    const dueDate = new Date("2026-05-06T18:30:00.000Z");
    const normalizedDueDate = new Date("2026-05-06T00:00:00.000Z");
    const dated = { ...baseFinding, dueDate: normalizedDueDate };
    const cleared = { ...baseFinding, dueDate: null };
    findingRepository.getProjectedByID
      .mockResolvedValueOnce(baseFinding)
      .mockResolvedValueOnce(dated)
      .mockResolvedValueOnce(dated)
      .mockResolvedValueOnce(cleared);
    findingRepository.updateByID.mockResolvedValue({ id: baseFinding.id });

    await expect(
      createService().updateByID({ id: baseFinding.id, finding: { dueDate }, user }),
    ).resolves.toEqual(dated);
    expect(findingRepository.updateByID).toHaveBeenLastCalledWith(
      baseFinding.id,
      expect.objectContaining({ dueDate: normalizedDueDate }),
    );

    await expect(
      createService().updateByID({ id: baseFinding.id, finding: { dueDate: null }, user }),
    ).resolves.toEqual(cleared);
    expect(findingRepository.updateByID).toHaveBeenLastCalledWith(
      baseFinding.id,
      expect.objectContaining({ dueDate: null }),
    );
  });

  it("rejects an unknown assignee before persisting", async () => {
    findingRepository.getProjectedByID.mockResolvedValue(baseFinding);
    userProfileService.getByID.mockResolvedValue(null);

    await expect(
      createService().updateByID({
        id: baseFinding.id,
        finding: { assigneeId },
        user,
      }),
    ).rejects.toMatchObject({
      code: "finding.assignee_unknown",
      kind: "validation",
      details: { assigneeId, findingId: baseFinding.id },
    } satisfies Partial<ApplicationError>);
    expect(findingRepository.updateByID).not.toHaveBeenCalled();
  });

  it("links and unlinks catalog vulnerabilities", async () => {
    const link = { findingId: baseFinding.id, vulnerabilityId: vulnerability.id };
    findingRepository.getProjectedByID.mockResolvedValue(baseFinding);
    vulnerabilityService.getByID.mockResolvedValue(vulnerability);
    findingRepository.linkVulnerability.mockResolvedValue({ link, changed: true });
    findingRepository.unlinkVulnerability.mockResolvedValue({ link, changed: true });

    await expect(
      createService().linkVulnerability({
        findingId: baseFinding.id,
        vulnerabilityId: vulnerability.id,
        user,
      }),
    ).resolves.toEqual({ finding: baseFinding, changed: true });
    expect(domainEvents.subjects()).toEqual(["finding.vulnerability.linked"]);

    domainEvents.clear();
    await expect(
      createService().unlinkVulnerability({
        findingId: baseFinding.id,
        vulnerabilityId: vulnerability.id,
        user,
      }),
    ).resolves.toEqual({ finding: baseFinding, changed: true });
    expect(domainEvents.subjects()).toEqual(["finding.vulnerability.unlinked"]);
  });

  it("deletes a finding and emits its final snapshot", async () => {
    findingRepository.getProjectedByID.mockResolvedValue(baseFinding);
    findingRepository.deleteByID.mockResolvedValue({ id: baseFinding.id });

    await expect(
      createService().deleteByID(baseFinding.id, {
        actor: user.id,
        correlationId: "findings-delete-request",
      }),
    ).resolves.toBe(baseFinding);
    expect(domainEvents.events[0]).toMatchObject({
      subject: "finding.deleted",
      actor: user.id,
      correlationId: "findings-delete-request",
      data: { finding: baseFinding },
    });
  });

  it("does not delete when the finding is missing", async () => {
    findingRepository.getProjectedByID.mockResolvedValue(null);

    await expect(createService().deleteByID(baseFinding.id)).resolves.toBeNull();
    expect(findingRepository.deleteByID).not.toHaveBeenCalled();
    expect(domainEvents.subjects()).toEqual([]);
  });
});
