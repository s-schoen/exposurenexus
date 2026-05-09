import { beforeEach, describe, expect, it, vi } from "vitest"
import { AssetType } from "@exposurenexus/types/model/asset"

vi.mock("../db/index.js", () => ({
  db: {},
  logger: {},
  pool: {}
}))

import {
  createAssetRepository,
  createFindingRepository,
  createRoleRepository,
  createUserRoleRepository,
  createVulnerabilityRepository
} from "./index.js"

describe("repository factories", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("creates an asset repository bound to the injected db", async () => {
    const execute = vi.fn().mockResolvedValue([])
    const query = {
      where: vi.fn(),
      executeTakeFirst: execute
    }
    query.where.mockReturnValue(query)
    const selectAll = vi.fn().mockReturnValue(query)
    const selectFrom = vi.fn().mockReturnValue({ selectAll })
    const db = { selectFrom }

    const repository = createAssetRepository(db as never)

    await repository.getByName("api.exposurenexus.local", AssetType.Host)

    expect(selectFrom).toHaveBeenCalledWith("asset")
    expect(query.where).toHaveBeenNthCalledWith(
      1,
      "name",
      "=",
      "api.exposurenexus.local"
    )
    expect(query.where).toHaveBeenNthCalledWith(2, "type", "=", AssetType.Host)
    expect(execute).toHaveBeenCalledOnce()
  })

  it("creates a finding repository bound to the injected db", async () => {
    const executeTakeFirst = vi.fn().mockResolvedValue(null)
    const where = vi.fn().mockReturnValue({ executeTakeFirst })
    const selectAll = vi.fn().mockReturnValue({ where })
    const selectFrom = vi.fn().mockReturnValue({ selectAll })
    const db = { selectFrom }

    const repository = createFindingRepository(db as never)

    await repository.getByFingerprint("hash")

    expect(selectFrom).toHaveBeenCalledWith("finding")
    expect(where).toHaveBeenCalledWith("fingerprint", "=", "hash")
  })

  it("creates a vulnerability repository bound to the injected db", async () => {
    const execute = vi.fn().mockResolvedValue([])
    const where = vi.fn().mockReturnValue({ execute })
    const selectAll = vi.fn().mockReturnValue({ where })
    const selectFrom = vi.fn().mockReturnValue({ selectAll })
    const db = { selectFrom }

    const repository = createVulnerabilityRepository(db as never)

    await repository.listMappings("nuclei")

    expect(selectFrom).toHaveBeenCalledWith("vulnerability_source_mapping")
    expect(where).toHaveBeenCalledWith("source", "=", "nuclei")
    expect(execute).toHaveBeenCalledOnce()
  })

  it("keeps role persistence and user permission lookup as separate repository surfaces", () => {
    expect(Object.keys(createRoleRepository({} as never)).sort()).toEqual(
      [
        "create",
        "deleteByID",
        "getByID",
        "getByIDs",
        "getByNames",
        "hasUsersWithRoleID",
        "list",
        "updateByID"
      ].sort()
    )
    expect(Object.keys(createUserRoleRepository({} as never))).toEqual([
      "listPermissionsByUserID"
    ])
  })
})
