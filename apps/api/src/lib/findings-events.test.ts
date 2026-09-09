import { beforeEach, describe, expect, it, vi } from "vitest";

import { createDomainEventCollector } from "../test/eventbus.js";
import { decorateFindingsWithEvents } from "./findings-events.js";

import type { Findings } from "@exposurenexus/backend/findings";
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

function createFindingsMock() {
  return {
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
  };
}

describe("findings event decorator", () => {
  const domainEvents = createDomainEventCollector();

  beforeEach(() => {
    vi.resetAllMocks();
    domainEvents.clear();
  });

  it("maps every mutation outcome to the existing event order without reads", async () => {
    const findings = createFindingsMock();
    findings.createManual.mockResolvedValue({
      current: finding,
      observation,
      performedBy: user.id,
    });
    findings.createManualObservation.mockResolvedValue({
      observation,
      previousFinding: finding,
      currentFinding,
      performedBy: user.id,
    });
    findings.updateObservation.mockResolvedValue({
      previousObservation: observation,
      observation: movedObservation,
      previousFinding: finding,
      currentFinding,
      performedBy: user.id,
    });
    findings.deleteObservation.mockResolvedValue({
      observation,
      previousFinding: finding,
      currentFinding,
      performedBy: user.id,
    });
    findings.moveObservation.mockResolvedValue({
      previousObservation: observation,
      observation: movedObservation,
      sourcePrevious: finding,
      sourceCurrent: currentFinding,
      targetPrevious: targetFinding,
      targetCurrent: currentFinding,
      performedBy: user.id,
    });
    findings.updateByID.mockResolvedValue({
      previous: finding,
      current: currentFinding,
      performedBy: user.id,
    });
    findings.deleteByID.mockResolvedValue({ previous: finding, performedBy: user.id });
    findings.linkVulnerability.mockResolvedValue({
      finding: currentFinding,
      vulnerability,
      link,
      changed: true,
      performedBy: user.id,
    });
    findings.unlinkVulnerability.mockResolvedValue({
      finding: currentFinding,
      vulnerability,
      link,
      changed: true,
      performedBy: user.id,
    });
    const decorated = decorateFindingsWithEvents(
      findings as unknown as Findings,
      domainEvents.emitter,
    );

    await decorated.createManual({ finding: {} as never, user, eventContext });
    await decorated.createManualObservation({
      findingId: finding.id,
      observation: {},
      user,
      eventContext,
    });
    await decorated.updateObservation({
      findingId: finding.id,
      observationId: observation.id,
      observation: { title: "updated" },
      user,
      eventContext,
    });
    await decorated.deleteObservation({
      findingId: finding.id,
      observationId: observation.id,
      user,
      eventContext,
    });
    await decorated.moveObservation({
      findingId: finding.id,
      observationId: observation.id,
      targetFindingId: targetFinding.id,
      user,
      eventContext,
    });
    await decorated.updateByID({
      id: finding.id,
      finding: { title: "Updated finding" },
      user,
      eventContext,
    });
    await decorated.deleteByID(finding.id, eventContext);
    await decorated.linkVulnerability({
      findingId: finding.id,
      vulnerabilityId: vulnerability.id,
      user,
      eventContext,
    });
    await decorated.unlinkVulnerability({
      findingId: finding.id,
      vulnerabilityId: vulnerability.id,
      user,
      eventContext,
    });

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
    ]);
    expect(domainEvents.events.map((event) => event.data)).toEqual([
      { finding },
      { observation },
      { observation },
      { previous: finding, current: currentFinding },
      { previous: observation, current: movedObservation },
      { previous: finding, current: currentFinding },
      { observation },
      { previous: finding, current: currentFinding },
      { previous: observation, current: movedObservation },
      { previous: finding, current: currentFinding },
      { previous: targetFinding, current: currentFinding },
      { previous: finding, current: currentFinding },
      { finding },
      { finding: currentFinding, vulnerability, link },
      { finding: currentFinding, vulnerability, link },
    ]);
    for (const event of domainEvents.events) {
      expect(event).toMatchObject({
        source: expect.stringMatching(/^(finding|observation)$/),
        actor: eventContext.actor,
        correlationId: eventContext.correlationId,
      });
    }

    expect(findings.createManual).toHaveBeenCalledWith({
      finding: {},
      performedBy: user.id,
    });
    expect(findings.deleteByID).toHaveBeenCalledWith({
      id: finding.id,
      performedBy: user.id,
    });
    expect(findings.getByID).not.toHaveBeenCalled();
    expect(findings.listObservations).not.toHaveBeenCalled();
  });

  it("suppresses unchanged or missing mutation events", async () => {
    const findings = createFindingsMock();
    findings.updateByID.mockResolvedValue(null);
    findings.linkVulnerability.mockResolvedValue({
      finding,
      vulnerability,
      link,
      changed: false,
      performedBy: user.id,
    });
    findings.unlinkVulnerability.mockResolvedValue({
      finding,
      vulnerability,
      link: null,
      changed: false,
      performedBy: user.id,
    });

    const decorated = decorateFindingsWithEvents(
      findings as unknown as Findings,
      domainEvents.emitter,
    );
    await decorated.updateByID({
      id: finding.id,
      finding: { title: "same" },
      user,
      eventContext,
    });
    await decorated.linkVulnerability({
      findingId: finding.id,
      vulnerabilityId: vulnerability.id,
      user,
      eventContext,
    });
    await decorated.unlinkVulnerability({
      findingId: finding.id,
      vulnerabilityId: vulnerability.id,
      user,
      eventContext,
    });

    expect(domainEvents.events).toEqual([]);
  });

  it("requires an actor for delete commands before calling the backend", async () => {
    const findings = createFindingsMock();
    const decorated = decorateFindingsWithEvents(
      findings as unknown as Findings,
      domainEvents.emitter,
    );

    await expect(decorated.deleteByID(finding.id)).rejects.toThrow(
      "exposure mutations require an authenticated actor",
    );
    expect(findings.deleteByID).not.toHaveBeenCalled();
  });

  it("emits only after the backend mutation resolves and never on rejection", async () => {
    const findings = createFindingsMock();
    let resolve!: (outcome: { previous: Finding; performedBy: string }) => void;
    findings.deleteByID.mockReturnValueOnce(
      new Promise((resolveOutcome) => {
        resolve = resolveOutcome;
      }),
    );
    const decorated = decorateFindingsWithEvents(
      findings as unknown as Findings,
      domainEvents.emitter,
    );

    const deletion = decorated.deleteByID(finding.id, eventContext);
    expect(domainEvents.events).toEqual([]);
    resolve({ previous: finding, performedBy: user.id });
    await expect(deletion).resolves.toBe(finding);
    expect(domainEvents.subjects()).toEqual(["finding.deleted"]);

    domainEvents.clear();
    findings.deleteByID.mockRejectedValueOnce(new Error("mutation failed"));
    await expect(decorated.deleteByID(finding.id, eventContext)).rejects.toThrow("mutation failed");
    expect(domainEvents.events).toEqual([]);
  });
});
