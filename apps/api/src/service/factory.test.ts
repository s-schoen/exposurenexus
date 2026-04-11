import { beforeEach, describe, expect, it, vi } from "vitest"
import { FindingSource, FindingStatus } from "@openvlp/types/model/finding"
import { VulnerabilitySeverity } from "@openvlp/types/model/vulnerability"
import { createTestUser } from "../test/app.js"
import { pino } from "pino"

vi.mock("../logging.js", () => ({
  createLogger: vi.fn(() => pino({ enabled: false }))
}))

vi.mock("../repository/asset.js", () => ({
  list: vi.fn(),
  getByID: vi.fn(),
  getByName: vi.fn(),
  create: vi.fn(),
  deleteByID: vi.fn()
}))

vi.mock("../repository/finding.js", () => ({
  list: vi.fn(),
  getByID: vi.fn(),
  getByFingerprint: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  deleteByID: vi.fn(),
  countBy: vi.fn()
}))

vi.mock("../repository/vulnerability.js", () => ({
  list: vi.fn(),
  getByID: vi.fn(),
  create: vi.fn(),
  deleteByID: vi.fn(),
  listMappings: vi.fn(),
  getMappingBy: vi.fn(),
  createMapping: vi.fn(),
  deleteMappingByID: vi.fn()
}))

vi.mock("./vulnerability.js", async () => {
  const actual =
    await vi.importActual<typeof import("./vulnerability.js")>(
      "./vulnerability.js"
    )

  return {
    ...actual,
    getByID: vi.fn()
  }
})

import {
  createAssetService,
  createFindingService,
  createStatsService,
  createVulnerabilityService
} from "./index.js"

describe("service factories", () => {
  const user = createTestUser()
  const logger = pino({ enabled: false })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  it("creates an asset service bound to the injected repository", async () => {
    const repository = {
      list: vi.fn().mockResolvedValue([]),
      getByID: vi.fn(),
      getByName: vi.fn(),
      create: vi.fn(),
      deleteByID: vi.fn()
    }
    const service = createAssetService({ assetRepository: repository, logger })

    await service.listAll()

    expect(repository.list).toHaveBeenCalledOnce()
  })

  it("creates a vulnerability service bound to the injected repository", async () => {
    const now = new Date("2026-02-03T04:05:06.000Z")
    const repository = {
      list: vi.fn(),
      getByID: vi.fn(),
      create: vi.fn().mockImplementation(async (input) => ({
        id: "9d7acdd0-fad1-46c9-8218-1793f421f0fe",
        ...input
      })),
      deleteByID: vi.fn(),
      listMappings: vi.fn(),
      getMappingBy: vi.fn(),
      createMapping: vi.fn(),
      deleteMappingByID: vi.fn()
    }
    vi.useFakeTimers()
    vi.setSystemTime(now)

    const service = createVulnerabilityService({
      vulnerabilityRepository: repository,
      logger
    })

    await service.create({
      user,
      vulnerability: {
        title: "Exposed Admin Endpoint",
        severity: VulnerabilitySeverity.High,
        description: "Administrative interface is reachable externally",
        cwe: 284,
        cve: null
      }
    })

    expect(repository.create).toHaveBeenCalledWith({
      title: "Exposed Admin Endpoint",
      severity: VulnerabilitySeverity.High,
      description: "Administrative interface is reachable externally",
      cwe: 284,
      cve: null,
      createdBy: user.id,
      updatedBy: user.id,
      createdAt: now,
      updatedAt: now
    })
  })

  it("creates a stats service bound to the injected repository", async () => {
    const repository = {
      countBy: vi.fn().mockResolvedValue({})
    }
    const service = createStatsService({
      findingRepository: repository,
      logger
    })

    await service.getFindingStats()

    expect(repository.countBy).toHaveBeenCalledWith("severity")
  })

  it("creates a finding service bound to injected dependencies", async () => {
    const now = new Date("2026-02-03T04:05:06.000Z")
    const findingRepository = {
      list: vi.fn(),
      getByID: vi.fn(),
      getByFingerprint: vi.fn(),
      create: vi.fn().mockImplementation(async (input) => ({
        id: "2713d833-eb13-4517-ac7c-7761545ed42a",
        ...input
      })),
      update: vi.fn(),
      deleteByID: vi.fn(),
      countBy: vi.fn()
    }
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
        updatedAt: new Date("2026-01-01T00:00:00.000Z")
      })
    }
    vi.useFakeTimers()
    vi.setSystemTime(now)

    const service = createFindingService({
      findingRepository,
      vulnerabilityService,
      logger
    })

    await service.create({
      user,
      finding: {
        vulnerabilityId: "9d7acdd0-fad1-46c9-8218-1793f421f0fe",
        severity: VulnerabilitySeverity.High,
        status: FindingStatus.Active,
        source: FindingSource.Manual,
        evidence: "Observed exposed admin endpoint",
        mitigation: "Restrict access to internal networks",
        assetId: "447b53a7-c3ce-4a0c-b96a-099f5e5dc71c"
      }
    })

    expect(findingRepository.create).toHaveBeenCalledOnce()
    expect(vulnerabilityService.getByID).toHaveBeenCalledWith(
      "9d7acdd0-fad1-46c9-8218-1793f421f0fe"
    )
  })
})
