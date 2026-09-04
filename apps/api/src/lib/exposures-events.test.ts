import { beforeEach, describe, expect, it, vi } from "vitest";

import { createDomainEventCollector } from "../test/eventbus.js";
import { decorateExposuresWithEvents } from "./exposures-events.js";

import type { Exposures } from "@exposurenexus/backend/exposures";
import type { Finding } from "@exposurenexus/contracts/model/finding";
import type { Observation } from "@exposurenexus/contracts/model/observation";
import type { UserProfile } from "@exposurenexus/contracts/model/user";
import type { VulnerabilityCatalog } from "@exposurenexus/contracts/model/vulnerability";

const user: UserProfile = {
  id: "72fb3d48-4f34-4ec4-b7cd-9f68f5f4d19f",
  email: "tester@example.com",
  username: "tester",
  displayName: "Test User",
  enabled: true,
  roleIds: [],
};
const eventContext = { actor: user.id, correlationId: "exposure-event-request" };
const finding = { id: "2713d833-eb13-4517-ac7c-7761545ed42a" } as Finding;
const currentFinding = { ...finding, title: "Updated finding" } as Finding;
const targetFinding = { id: "f74d7ff2-2d81-4d1e-9fa9-73af7d46a37d" } as Finding;
const observation = {
  id: "9d7acdd0-fad1-46c9-8218-1793f421f0fe",
  findingId: finding.id,
} as Observation;
const movedObservation = { ...observation, findingId: targetFinding.id } as Observation;
const vulnerability = { id: "a7d3ef96-d3b4-48bb-8386-681eb3be7b12" } as VulnerabilityCatalog;
const link = { findingId: finding.id, vulnerabilityId: vulnerability.id };

function createExposuresMock() {
  return {
    findings: {
      listAll: vi.fn(),
      getByID: vi.fn(),
      createManual: vi.fn(),
      listObservations: vi.fn(),
      createManualObservation: vi.fn(),
      updateObservation: vi.fn(),
      deleteObservation: vi.fn(),
      moveObservation: vi.fn(),
      updateByID: vi.fn(),
      deleteByID: vi.fn(),
      linkVulnerability: vi.fn(),
      unlinkVulnerability: vi.fn(),
    },
    vulnerabilities: {
      listAll: vi.fn(),
      getByID: vi.fn(),
      create: vi.fn(),
      updateByID: vi.fn(),
      deleteByID: vi.fn(),
    },
    statistics: {
      getFindingStats: vi.fn(),
    },
  };
}

describe("exposures event decorator", () => {
  const domainEvents = createDomainEventCollector();

  beforeEach(() => {
    vi.resetAllMocks();
    domainEvents.clear();
  });

  it("maps every mutation outcome to the existing event order without reads", async () => {
    const exposures = createExposuresMock();
    exposures.findings.createManual.mockResolvedValue({
      current: finding,
      observation,
      performedBy: user.id,
    });
    exposures.findings.createManualObservation.mockResolvedValue({
      observation,
      previousFinding: finding,
      currentFinding,
      performedBy: user.id,
    });
    exposures.findings.updateObservation.mockResolvedValue({
      previousObservation: observation,
      observation: movedObservation,
      previousFinding: finding,
      currentFinding,
      performedBy: user.id,
    });
    exposures.findings.deleteObservation.mockResolvedValue({
      observation,
      previousFinding: finding,
      currentFinding,
      performedBy: user.id,
    });
    exposures.findings.moveObservation.mockResolvedValue({
      previousObservation: observation,
      observation: movedObservation,
      sourcePrevious: finding,
      sourceCurrent: currentFinding,
      targetPrevious: targetFinding,
      targetCurrent: currentFinding,
      performedBy: user.id,
    });
    exposures.findings.updateByID.mockResolvedValue({
      previous: finding,
      current: currentFinding,
      performedBy: user.id,
    });
    exposures.findings.deleteByID.mockResolvedValue({ previous: finding, performedBy: user.id });
    exposures.findings.linkVulnerability.mockResolvedValue({
      finding: currentFinding,
      vulnerability,
      link,
      changed: true,
      performedBy: user.id,
    });
    exposures.findings.unlinkVulnerability.mockResolvedValue({
      finding: currentFinding,
      vulnerability,
      link,
      changed: true,
      performedBy: user.id,
    });
    exposures.vulnerabilities.create.mockResolvedValue({
      current: vulnerability,
      performedBy: user.id,
    });
    exposures.vulnerabilities.updateByID.mockResolvedValue({
      previous: vulnerability,
      current: vulnerability,
      performedBy: user.id,
    });
    exposures.vulnerabilities.deleteByID.mockResolvedValue({
      previous: vulnerability,
      performedBy: user.id,
    });

    const decorated = decorateExposuresWithEvents(
      exposures as unknown as Exposures,
      domainEvents.emitter,
    );

    await decorated.findings.createManual({ finding: {} as never, user, eventContext });
    await decorated.findings.createManualObservation({
      findingId: finding.id,
      observation: {},
      user,
      eventContext,
    });
    await decorated.findings.updateObservation({
      findingId: finding.id,
      observationId: observation.id,
      observation: { title: "updated" },
      user,
      eventContext,
    });
    await decorated.findings.deleteObservation({
      findingId: finding.id,
      observationId: observation.id,
      user,
      eventContext,
    });
    await decorated.findings.moveObservation({
      findingId: finding.id,
      observationId: observation.id,
      targetFindingId: targetFinding.id,
      user,
      eventContext,
    });
    await decorated.findings.updateByID({
      id: finding.id,
      finding: { title: "Updated finding" },
      user,
      eventContext,
    });
    await decorated.findings.deleteByID(finding.id, eventContext);
    await decorated.findings.linkVulnerability({
      findingId: finding.id,
      vulnerabilityId: vulnerability.id,
      user,
      eventContext,
    });
    await decorated.findings.unlinkVulnerability({
      findingId: finding.id,
      vulnerabilityId: vulnerability.id,
      user,
      eventContext,
    });
    await decorated.vulnerabilities.create({ vulnerability: {} as never, user, eventContext });
    await decorated.vulnerabilities.updateByID({
      id: vulnerability.id,
      vulnerability: {} as never,
      user,
      eventContext,
    });
    await decorated.vulnerabilities.deleteByID(vulnerability.id, eventContext);

    expect(domainEvents.subjects()).toEqual([
      "finding.created",
      "observation.created",
      "observation.created",
      "finding.updated",
      "observation.updated",
      "finding.updated",
      "observation.deleted",
      "finding.updated",
      "observation.moved",
      "finding.updated",
      "finding.updated",
      "finding.updated",
      "finding.deleted",
      "finding.vulnerability.linked",
      "finding.vulnerability.unlinked",
      "vulnerability.created",
      "vulnerability.updated",
      "vulnerability.deleted",
    ]);
    for (const event of domainEvents.events) {
      expect(event).toMatchObject({
        source: expect.stringMatching(/^(finding|observation|vulnerability)$/),
        actor: eventContext.actor,
        correlationId: eventContext.correlationId,
      });
    }

    expect(exposures.findings.createManual).toHaveBeenCalledWith({
      finding: {},
      performedBy: user.id,
    });
    expect(exposures.findings.deleteByID).toHaveBeenCalledWith({
      id: finding.id,
      performedBy: user.id,
    });
    expect(exposures.vulnerabilities.deleteByID).toHaveBeenCalledWith({
      id: vulnerability.id,
      performedBy: user.id,
    });
    expect(exposures.findings.getByID).not.toHaveBeenCalled();
    expect(exposures.findings.listObservations).not.toHaveBeenCalled();
    expect(exposures.vulnerabilities.getByID).not.toHaveBeenCalled();
  });

  it("suppresses unchanged or missing mutation events", async () => {
    const exposures = createExposuresMock();
    exposures.findings.updateByID.mockResolvedValue(null);
    exposures.findings.linkVulnerability.mockResolvedValue({
      finding,
      vulnerability,
      link,
      changed: false,
      performedBy: user.id,
    });
    exposures.findings.unlinkVulnerability.mockResolvedValue({
      finding,
      vulnerability,
      link: null,
      changed: false,
      performedBy: user.id,
    });
    exposures.vulnerabilities.updateByID.mockResolvedValue(null);

    const decorated = decorateExposuresWithEvents(
      exposures as unknown as Exposures,
      domainEvents.emitter,
    );
    await decorated.findings.updateByID({
      id: finding.id,
      finding: { title: "same" },
      user,
      eventContext,
    });
    await decorated.findings.linkVulnerability({
      findingId: finding.id,
      vulnerabilityId: vulnerability.id,
      user,
      eventContext,
    });
    await decorated.findings.unlinkVulnerability({
      findingId: finding.id,
      vulnerabilityId: vulnerability.id,
      user,
      eventContext,
    });
    await decorated.vulnerabilities.updateByID({
      id: vulnerability.id,
      vulnerability: {} as never,
      user,
      eventContext,
    });

    expect(domainEvents.events).toEqual([]);
  });

  it("requires an actor for delete commands before calling the backend", async () => {
    const exposures = createExposuresMock();
    const decorated = decorateExposuresWithEvents(
      exposures as unknown as Exposures,
      domainEvents.emitter,
    );

    await expect(decorated.findings.deleteByID(finding.id)).rejects.toThrow(
      "exposure mutations require an authenticated actor",
    );
    await expect(decorated.vulnerabilities.deleteByID(vulnerability.id)).rejects.toThrow(
      "exposure mutations require an authenticated actor",
    );
    expect(exposures.findings.deleteByID).not.toHaveBeenCalled();
    expect(exposures.vulnerabilities.deleteByID).not.toHaveBeenCalled();
  });
});
