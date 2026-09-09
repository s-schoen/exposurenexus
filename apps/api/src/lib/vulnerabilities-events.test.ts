import { beforeEach, describe, expect, it, vi } from "vitest";

import { createDomainEventCollector } from "../test/eventbus.js";
import { decorateVulnerabilitiesWithEvents } from "./vulnerabilities-events.js";

import type { Vulnerabilities } from "@exposurenexus/backend/vulnerabilities";
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
const vulnerability = { id: "a7d3ef96-d3b4-48bb-8386-681eb3be7b12" } as VulnerabilityCatalog;

function createVulnerabilitiesMock() {
  return {
    listAll: vi.fn(),
    getByID: vi.fn(),
    create: vi.fn(),
    updateByID: vi.fn(),
    deleteByID: vi.fn(),
  };
}

describe("vulnerabilities event decorator", () => {
  const domainEvents = createDomainEventCollector();

  beforeEach(() => {
    vi.resetAllMocks();
    domainEvents.clear();
  });

  it("maps every mutation outcome to the existing event order without reads", async () => {
    const vulnerabilities = createVulnerabilitiesMock();
    vulnerabilities.create.mockResolvedValue({ current: vulnerability, performedBy: user.id });
    vulnerabilities.updateByID.mockResolvedValue({
      previous: vulnerability,
      current: vulnerability,
      performedBy: user.id,
    });
    vulnerabilities.deleteByID.mockResolvedValue({ previous: vulnerability, performedBy: user.id });
    const decorated = decorateVulnerabilitiesWithEvents(
      vulnerabilities as unknown as Vulnerabilities,
      domainEvents.emitter,
    );

    await decorated.create({ vulnerability: {} as never, user, eventContext });
    await decorated.updateByID({
      id: vulnerability.id,
      vulnerability: {} as never,
      user,
      eventContext,
    });
    await decorated.deleteByID(vulnerability.id, eventContext);

    expect(domainEvents.subjects()).toEqual([
      "vulnerability.created",
      "vulnerability.updated",
      "vulnerability.deleted",
    ]);
    expect(domainEvents.events.map((event) => event.data)).toEqual([
      { vulnerability },
      { previous: vulnerability, current: vulnerability },
      { vulnerability },
    ]);
    for (const event of domainEvents.events) {
      expect(event).toMatchObject({
        source: "vulnerability",
        actor: eventContext.actor,
        correlationId: eventContext.correlationId,
      });
    }
    expect(vulnerabilities.deleteByID).toHaveBeenCalledWith({
      id: vulnerability.id,
      performedBy: user.id,
    });
    expect(vulnerabilities.getByID).not.toHaveBeenCalled();
  });

  it("suppresses missing mutation events", async () => {
    const vulnerabilities = createVulnerabilitiesMock();
    vulnerabilities.updateByID.mockResolvedValue(null);
    const decorated = decorateVulnerabilitiesWithEvents(
      vulnerabilities as unknown as Vulnerabilities,
      domainEvents.emitter,
    );
    await decorated.updateByID({
      id: vulnerability.id,
      vulnerability: {} as never,
      user,
      eventContext,
    });
    expect(domainEvents.events).toEqual([]);
  });

  it("requires an actor for delete commands before calling the backend", async () => {
    const vulnerabilities = createVulnerabilitiesMock();
    const decorated = decorateVulnerabilitiesWithEvents(
      vulnerabilities as unknown as Vulnerabilities,
      domainEvents.emitter,
    );
    await expect(decorated.deleteByID(vulnerability.id)).rejects.toThrow(
      "exposure mutations require an authenticated actor",
    );
    expect(vulnerabilities.deleteByID).not.toHaveBeenCalled();
  });

  it("emits only after the backend mutation resolves and never on rejection", async () => {
    const vulnerabilities = createVulnerabilitiesMock();
    let resolve!: (outcome: { previous: VulnerabilityCatalog; performedBy: string }) => void;
    vulnerabilities.deleteByID.mockReturnValueOnce(
      new Promise((resolveOutcome) => {
        resolve = resolveOutcome;
      }),
    );
    const decorated = decorateVulnerabilitiesWithEvents(
      vulnerabilities as unknown as Vulnerabilities,
      domainEvents.emitter,
    );

    const deletion = decorated.deleteByID(vulnerability.id, eventContext);
    expect(domainEvents.events).toEqual([]);
    resolve({ previous: vulnerability, performedBy: user.id });
    await expect(deletion).resolves.toBe(vulnerability);
    expect(domainEvents.subjects()).toEqual(["vulnerability.deleted"]);

    domainEvents.clear();
    vulnerabilities.deleteByID.mockRejectedValueOnce(new Error("mutation failed"));
    await expect(decorated.deleteByID(vulnerability.id, eventContext)).rejects.toThrow(
      "mutation failed",
    );
    expect(domainEvents.events).toEqual([]);
  });
});
