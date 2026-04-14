import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { sql } from "kysely"

vi.mock("../env.js", () => ({
  env: {
    PORT: 3001,
    LOG_LEVEL: "info",
    AUTH_URL: "http://localhost:3000",
    AUTH_SECRET: "012345678901234567890123456789012345678901234567890123456789",
    DATABASE_URL: "postgres://openvlp:openvlp@localhost:5432/openvlp",
    API_TIMEOUT_MS: 5000
  }
}))

const { createTestDatabase } = await import("../test/db.js")

describe("db migration columns", () => {
  const testDb = createTestDatabase()

  beforeAll(async () => {
    await testDb.start()
  })

  afterAll(async () => {
    await testDb.dispose()
  })

  it("creates better-auth admin plugin columns", async () => {
    const userColumns = await sql<{ column_name: string }>`
      select column_name
      from information_schema.columns
      where table_name = 'user'
    `.execute(testDb.db)

    const sessionColumns = await sql<{ column_name: string }>`
      select column_name
      from information_schema.columns
      where table_name = 'session'
    `.execute(testDb.db)

    expect(userColumns.rows.map((row) => row.column_name)).toEqual(
      expect.arrayContaining(["role", "banned", "banReason", "banExpires"])
    )
    expect(sessionColumns.rows.map((row) => row.column_name)).toContain(
      "impersonatedBy"
    )
  })
})
