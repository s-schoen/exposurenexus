import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Kysely } from "kysely"
import type { Database } from "./index.js"
import type { Logger } from "pino"

const { migrateToLatestMock, migratorConstructor } = vi.hoisted(() => {
  const migrateToLatestMock = vi.fn()
  const migratorConstructor = vi.fn(() => ({
    migrateToLatest: migrateToLatestMock
  }))

  return {
    migrateToLatestMock,
    migratorConstructor
  }
})

vi.mock("kysely", async () => {
  const actual = await vi.importActual<typeof import("kysely")>("kysely")

  return {
    ...actual,
    Migrator: migratorConstructor
  }
})

vi.mock("./index.js", () => ({
  db: {},
  logger: {}
}))

import { migrateToLatest } from "./migration.js"

describe("db migration", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("runs migrations against the injected db and logger", async () => {
    const db = { destroy: vi.fn() } as unknown as Kysely<Database>
    const logger = {
      info: vi.fn(),
      error: vi.fn()
    } as unknown as Logger

    migrateToLatestMock.mockResolvedValue({
      error: undefined,
      results: [
        {
          migrationName: "20251220-assets",
          status: "Success"
        }
      ]
    })

    await migrateToLatest(db, logger)

    expect(migratorConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        db,
        provider: expect.any(Object)
      })
    )
    expect(logger.info).toHaveBeenCalledWith("migrating database")
    expect(logger.info).toHaveBeenCalledWith(
      'migration "20251220-assets" applied successfully'
    )
  })
})
