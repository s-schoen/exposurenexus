import {
  VulnerabilitySeverity,
  VulnerabilityType,
} from "@exposurenexus/contracts/model/vulnerability";
import { pino } from "pino";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestUser } from "../test/app.js";

vi.mock("../logging.js", () => ({
  createLogger: vi.fn(() => pino({ enabled: false })),
}));

vi.mock("../repository/asset.js", () => ({
  list: vi.fn(),
  getByID: vi.fn(),
  getByDisplayName: vi.fn(),
  create: vi.fn(),
  deleteByID: vi.fn(),
}));

vi.mock("./vulnerability.js", async () => {
  const actual = await vi.importActual<typeof import("./vulnerability.js")>("./vulnerability.js");

  return {
    ...actual,
    getByID: vi.fn(),
  };
});

import { createAssetService } from "./asset.js";
import { createFindingService } from "./finding.js";
import { createStatsService } from "./stats.js";
import { createVulnerabilityService } from "./vulnerability.js";

describe("service factories", () => {
  const user = createTestUser();
  const logger = pino({ enabled: false });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("creates an asset service bound to the injected repository", async () => {
    const repository = {
      list: vi.fn().mockResolvedValue([]),
      getByID: vi.fn(),
      getByDisplayName: vi.fn(),
      listByDisplayName: vi.fn(),
      getIdentifierByID: vi.fn(),
      getAssetIDByIdentifier: vi.fn(),
      create: vi.fn(),
      updateByID: vi.fn(),
      addIdentifier: vi.fn(),
      updateIdentifierByID: vi.fn(),
      deleteIdentifierByID: vi.fn(),
      deleteByID: vi.fn(),
      countFindingsByAssetID: vi.fn(),
    };
    const service = createAssetService({
      assetRepository: repository,
      assetCustomFieldReader: {
        listEffectiveValuesForAssets: vi.fn(),
      },
      userProfileService: {
        getByID: vi.fn(),
      },
      domainEventEmitter: {
        emit: vi.fn(),
      },
      logger,
    });

    await service.listAll();

    expect(repository.list).toHaveBeenCalledOnce();
  });

  it("creates a vulnerability service bound to the injected repository", async () => {
    const now = new Date("2026-02-03T04:05:06.000Z");
    const repository = {
      list: vi.fn(),
      getByID: vi.fn(),
      create: vi.fn().mockImplementation(async (input) => ({
        id: "9d7acdd0-fad1-46c9-8218-1793f421f0fe",
        ...input,
      })),
      updateByID: vi.fn(),
      deleteByID: vi.fn(),
    };
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const service = createVulnerabilityService({
      vulnerabilityRepository: repository,
      domainEventEmitter: {
        emit: vi.fn(),
      },
      logger,
    });

    await service.create({
      user,
      vulnerability: {
        type: VulnerabilityType.Custom,
        identifier: "exposed-admin-endpoint",
        title: "Exposed Admin Endpoint",
        severity: VulnerabilitySeverity.High,
        description: "Administrative interface is reachable externally",
        metadata: { cwe: 284 },
      },
    });

    expect(repository.create).toHaveBeenCalledWith({
      type: "custom",
      identifier: "exposed-admin-endpoint",
      title: "Exposed Admin Endpoint",
      severity: VulnerabilitySeverity.High,
      description: "Administrative interface is reachable externally",
      metadata: { cwe: 284 },
      createdBy: user.id,
      updatedBy: user.id,
      createdAt: now,
      updatedAt: now,
    });
  });

  it("creates a stats service bound to the injected repository", async () => {
    const repository = {
      countBy: vi.fn().mockResolvedValue({}),
    };
    const service = createStatsService({
      findingRepository: repository,
      logger,
    });

    await service.getFindingStats();

    expect(repository.countBy).toHaveBeenCalledWith("severity");
  });

  it("creates a finding service bound to injected dependencies", async () => {
    const findingRepository = {
      listProjected: vi.fn().mockResolvedValue([]),
      getProjectedByID: vi.fn().mockResolvedValue({ id: "finding-id" }),
      createManual: vi.fn(),
      updateByID: vi.fn(),
      deleteByID: vi.fn(),
      linkVulnerability: vi.fn(),
      unlinkVulnerability: vi.fn(),
    };
    const observationRepository = {
      listByFindingID: vi.fn().mockResolvedValue([]),
      createAndTouchFinding: vi.fn(),
      updateAndTouchFinding: vi.fn(),
      deleteAndTouchFinding: vi.fn(),
      moveAndTouchFindings: vi.fn(),
    };

    const service = createFindingService({
      findingRepository,
      observationRepository,
      assetService: { getByID: vi.fn() },
      userProfileService: {
        getByID: vi.fn(),
      },
      vulnerabilityService: { getByID: vi.fn() },
      domainEventEmitter: {
        emit: vi.fn(),
      },
      logger,
    });

    await service.listAll();
    await service.listObservations("finding-id");

    expect(findingRepository.listProjected).toHaveBeenCalledOnce();
    expect(findingRepository.getProjectedByID).toHaveBeenCalledWith("finding-id");
    expect(observationRepository.listByFindingID).toHaveBeenCalledWith("finding-id");
    expect(findingRepository).toHaveProperty("linkVulnerability");
  });
});
