import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest"
import { AssetType } from "@openvlp/types/model/asset"
import { createAssetRepository } from "./asset.js"
import { createTestDatabase, resetTestDatabase } from "../test/db.js"

vi.mock("../db/index.js", () => ({
  db: {},
  logger: {},
  pool: {}
}))

describe("asset repository", () => {
  const testDb = createTestDatabase()

  beforeAll(async () => {
    await testDb.start()
  })

  afterAll(async () => {
    await testDb.dispose()
  })

  beforeEach(async () => {
    await resetTestDatabase(testDb.db)
  })

  it("persists and retrieves assets against a real database", async () => {
    const repository = createAssetRepository(testDb.db)
    const created = await repository.create({
      id: "",
      name: "api.openvlp.local",
      type: AssetType.Host
    })

    expect(created.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    )
    expect(created.name).toBe("api.openvlp.local")
    expect(created.type).toBe(AssetType.Host)

    await expect(repository.getByID(created.id)).resolves.toEqual(created)
    await expect(
      repository.getByName("api.openvlp.local", AssetType.Host)
    ).resolves.toEqual(created)
    await expect(repository.list()).resolves.toEqual([created])
  })
})
