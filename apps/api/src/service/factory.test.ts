import { AssetType } from "@exposurenexus/types/model/asset";
import { FindingSource, FindingStatus } from "@exposurenexus/types/model/finding";
import { PermissionResource, PermissionVerb } from "@exposurenexus/types/model/rbac";
import { VulnerabilitySeverity } from "@exposurenexus/types/model/vulnerability";
import { pino } from "pino";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestUser } from "../test/app.js";

vi.mock("../logging.js", () => ({
  createLogger: vi.fn(() => pino({ enabled: false })),
}));

vi.mock("../repository/asset.js", () => ({
  list: vi.fn(),
  getByID: vi.fn(),
  getByName: vi.fn(),
  create: vi.fn(),
  deleteByID: vi.fn(),
}));

vi.mock("../repository/finding.js", () => ({
  list: vi.fn(),
  getByID: vi.fn(),
  getByFingerprint: vi.fn(),
  create: vi.fn(),
  updateByID: vi.fn(),
  deleteByID: vi.fn(),
  reclassifyBySourceAndVulnerability: vi.fn(),
  countBy: vi.fn(),
}));

vi.mock("../repository/vulnerability.js", () => ({
  list: vi.fn(),
  getByID: vi.fn(),
  create: vi.fn(),
  updateByID: vi.fn(),
  deleteByID: vi.fn(),
  countFindingsByVulnerabilityID: vi.fn(),
  listMappings: vi.fn(),
  listMappingsByVulnerabilityID: vi.fn(),
  getMappingBy: vi.fn(),
  createMapping: vi.fn(),
  updateMappingByID: vi.fn(),
  deleteMappingByID: vi.fn(),
}));

vi.mock("./vulnerability.js", async () => {
  const actual = await vi.importActual<typeof import("./vulnerability.js")>("./vulnerability.js");

  return {
    ...actual,
    getByID: vi.fn(),
  };
});

import { createAssetService } from "./asset.js";
import { createAuthService } from "./auth.js";
import { createFindingService } from "./finding.js";
import { createRoleService } from "./role.js";
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
      getByName: vi.fn(),
      create: vi.fn(),
      updateOwnerByID: vi.fn(),
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

  it("creates an auth service bound to the injected permission lookup repository", async () => {
    const userRoleRepository = {
      listPermissionsByUserID: vi.fn().mockResolvedValue([
        {
          resource: PermissionResource.Asset,
          verb: PermissionVerb.Read,
        },
      ]),
    };
    const service = createAuthService({
      userProfileRepository: {
        getByID: vi.fn(),
        getByUsername: vi.fn(),
      },
      userSessionRepository: {
        getBySessionID: vi.fn(),
        create: vi.fn(),
        deleteBySessionID: vi.fn(),
      },
      userRoleRepository,
      domainEventEmitter: {
        emit: vi.fn(),
      },
      sessionLifetimeHours: 12,
      sessionHmacSecret: "012345678901234567890123456789012345678901234567890123456789",
      logger,
    });

    await expect(
      service.userHasPermission(user.id, {
        [PermissionResource.Asset]: [PermissionVerb.Read],
      }),
    ).resolves.toBe(true);

    expect(userRoleRepository.listPermissionsByUserID).toHaveBeenCalledWith(user.id);
  });

  it("creates a role service bound to the injected repository", async () => {
    const repository = {
      list: vi.fn().mockResolvedValue([]),
      getByID: vi.fn(),
      getByIDs: vi.fn(),
      getByNames: vi.fn(),
      create: vi.fn(),
      updateByID: vi.fn(),
      deleteByID: vi.fn(),
      hasUsersWithRoleID: vi.fn(),
    };
    const service = createRoleService({
      roleRepository: repository,
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
      countFindingsByVulnerabilityID: vi.fn(),
      listMappings: vi.fn(),
      listMappingsByVulnerabilityID: vi.fn(),
      getMappingBy: vi.fn(),
      createMapping: vi.fn(),
      updateMappingByID: vi.fn(),
      deleteMappingByID: vi.fn(),
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
        title: "Exposed Admin Endpoint",
        severity: VulnerabilitySeverity.High,
        description: "Administrative interface is reachable externally",
        cwe: 284,
        cve: null,
      },
    });

    expect(repository.create).toHaveBeenCalledWith({
      title: "Exposed Admin Endpoint",
      severity: VulnerabilitySeverity.High,
      description: "Administrative interface is reachable externally",
      cwe: 284,
      cve: null,
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
    const now = new Date("2026-02-03T04:05:06.000Z");
    const findingRepository = {
      list: vi.fn(),
      getByID: vi.fn(),
      getByFingerprint: vi.fn(),
      create: vi.fn().mockImplementation(async (input) => ({
        id: "2713d833-eb13-4517-ac7c-7761545ed42a",
        ...input,
      })),
      updateByID: vi.fn(),
      deleteByID: vi.fn(),
      reclassifyBySourceAndVulnerability: vi.fn(),
      countBy: vi.fn(),
    };
    const vulnerabilityService = {
      getByID: vi.fn().mockResolvedValue({
        id: "9d7acdd0-fad1-46c9-8218-1793f421f0fe",
        title: "Exposed Admin Endpoint",
        severity: VulnerabilitySeverity.High,
        description: "Administrative interface is reachable externally",
        cwe: 284,
        cve: null,
        createdBy: user.id,
        updatedBy: user.id,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      }),
    };
    const assetService = {
      getByID: vi.fn().mockResolvedValue({
        id: "447b53a7-c3ce-4a0c-b96a-099f5e5dc71c",
        name: "api.exposurenexus.local",
        type: AssetType.Host,
        ownerId: null,
      }),
    };
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const service = createFindingService({
      findingRepository,
      assetService,
      userProfileService: {
        getByID: vi.fn(),
      },
      vulnerabilityService,
      domainEventEmitter: {
        emit: vi.fn(),
      },
      logger,
    });

    await service.create({
      user,
      finding: {
        vulnerabilityId: "9d7acdd0-fad1-46c9-8218-1793f421f0fe",
        severity: VulnerabilitySeverity.High,
        status: FindingStatus.Active,
        source: FindingSource.Manual,
        evidence: "Observed exposed admin endpoint",
        mitigation: "Restrict access to internal networks",
        assetId: "447b53a7-c3ce-4a0c-b96a-099f5e5dc71c",
      },
    });

    expect(findingRepository.create).toHaveBeenCalledOnce();
    expect(vulnerabilityService.getByID).toHaveBeenCalledWith(
      "9d7acdd0-fad1-46c9-8218-1793f421f0fe",
    );
  });
});
