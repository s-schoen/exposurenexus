import {
  VulnerabilitySeverity,
  VulnerabilityType,
  type VulnerabilityCatalog,
} from "@exposurenexus/contracts/model/vulnerability";
import { pino } from "pino";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createVulnerabilities } from "./vulnerabilities.js";

const actorId = "72fb3d48-4f34-4ec4-b7cd-9f68f5f4d19f";
const vulnerabilityId = "9d7acdd0-fad1-46c9-8218-1793f421f0fe";
const vulnerability: VulnerabilityCatalog = {
  id: vulnerabilityId,
  type: VulnerabilityType.Cve,
  identifier: "CVE-2026-0001",
  title: "Example vulnerability",
  description: null,
  severity: VulnerabilitySeverity.High,
  metadata: null,
  createdBy: actorId,
  updatedBy: actorId,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};
const input = {
  type: VulnerabilityType.Cve,
  identifier: "cve-2026-0001",
  title: vulnerability.title,
  severity: vulnerability.severity,
  description: vulnerability.description,
  metadata: vulnerability.metadata,
};

describe("exposure vulnerabilities", () => {
  const vulnerabilityPersistence = {
    listVulnerabilities: vi.fn(),
    getVulnerabilityByID: vi.fn(),
    insertVulnerability: vi.fn(),
    updateVulnerability: vi.fn(),
    deleteVulnerability: vi.fn(),
  };
  const userProfileLookup = { getByID: vi.fn() };
  const logger = pino({ enabled: false });
  const database = {
    transaction: () => ({
      execute: async (callback: (transaction: object) => unknown) => await callback({}),
    }),
  };

  beforeEach(() => {
    vi.resetAllMocks();
    userProfileLookup.getByID.mockResolvedValue({ id: actorId });
  });

  function createCapability() {
    return createVulnerabilities({
      database: database as never,
      vulnerabilityPersistence,
      userProfileLookup,
      logger,
    });
  }

  it("creates canonical catalog entries and returns a safe outcome", async () => {
    const now = new Date("2026-02-03T04:05:06.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vulnerabilityPersistence.insertVulnerability.mockImplementation(async (_database, record) => ({
      id: vulnerabilityId,
      ...record,
    }));

    await expect(
      createCapability().create({ vulnerability: input, performedBy: actorId }),
    ).resolves.toEqual({
      current: { ...vulnerability, createdAt: now, updatedAt: now },
      performedBy: actorId,
    });
    expect(vulnerabilityPersistence.insertVulnerability).toHaveBeenCalledWith(expect.anything(), {
      ...input,
      identifier: "CVE-2026-0001",
      createdAt: now,
      updatedAt: now,
      createdBy: actorId,
      updatedBy: actorId,
    });
    vi.useRealTimers();
  });

  it("returns before and after catalog snapshots for updates", async () => {
    const current = { ...vulnerability, title: "Updated vulnerability" };
    vulnerabilityPersistence.getVulnerabilityByID.mockResolvedValue(vulnerability);
    vulnerabilityPersistence.updateVulnerability.mockResolvedValue(current);

    await expect(
      createCapability().updateByID({
        id: vulnerabilityId,
        vulnerability: { ...input, title: current.title },
        performedBy: actorId,
      }),
    ).resolves.toEqual({ previous: vulnerability, current, performedBy: actorId });
  });

  it("returns deleted catalog snapshots without a compensating read", async () => {
    vulnerabilityPersistence.deleteVulnerability.mockResolvedValue(vulnerability);

    await expect(
      createCapability().deleteByID({ id: vulnerabilityId, performedBy: actorId }),
    ).resolves.toEqual({ previous: vulnerability, performedBy: actorId });
    expect(vulnerabilityPersistence.getVulnerabilityByID).not.toHaveBeenCalled();
  });

  it("rejects invalid catalog input before persistence", async () => {
    await expect(
      createCapability().create({
        vulnerability: { ...input, identifier: "not-a-cve" },
        performedBy: actorId,
      }),
    ).rejects.toMatchObject({ code: "vulnerability.invalid_input", kind: "validation" });
    expect(vulnerabilityPersistence.insertVulnerability).not.toHaveBeenCalled();
  });
});
