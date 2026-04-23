import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest"
import { createUserSessionRepository } from "./user-session.js"
import { createTestDatabase, resetTestDatabase } from "../test/db.js"

vi.mock("../db/index.js", () => ({
  db: {},
  logger: {},
  pool: {}
}))

describe("user session repository", () => {
  const testDb = createTestDatabase()
  const userProfile = {
    id: "ca8be35f-b523-47d1-a9d8-743dc272c0cb",
    username: "alice",
    displayName: "Alice Example",
    email: "alice@example.com",
    enabled: true,
    passwordHash: "hash-alice"
  }

  beforeAll(async () => {
    await testDb.start()
  })

  afterAll(async () => {
    await testDb.dispose()
  })

  beforeEach(async () => {
    await resetTestDatabase(testDb.db)
  })

  it("creates, lists, loads, and deletes user sessions", async () => {
    const repository = createUserSessionRepository(testDb.db)
    const firstSession = {
      sessionId: "3783ac06-42be-43d4-bad3-6aa2c5c5363d",
      userId: userProfile.id,
      sourceIp: "203.0.113.10",
      userAgent: "Mozilla/5.0",
      createdAt: new Date("2026-04-23T08:00:00.000Z"),
      expiresAt: new Date("2026-04-23T10:00:00.000Z")
    }
    const secondSession = {
      sessionId: "1d06e984-3c8a-470f-b559-7f732ab73602",
      userId: userProfile.id,
      sourceIp: null,
      userAgent: null,
      createdAt: new Date("2026-04-23T09:00:00.000Z"),
      expiresAt: new Date("2026-04-23T11:00:00.000Z")
    }

    await testDb.db.insertInto("user_profile").values(userProfile).execute()

    const createdFirstSession = await repository.create(firstSession)
    const createdSecondSession = await repository.create(secondSession)

    expect(createdFirstSession).toEqual({
      id: expect.any(String),
      ...firstSession
    })
    expect(createdSecondSession).toEqual({
      id: expect.any(String),
      ...secondSession
    })

    await expect(
      repository.getBySessionID(firstSession.sessionId)
    ).resolves.toEqual(createdFirstSession)

    const sessions = await repository.list()

    expect(sessions).toHaveLength(2)
    expect(sessions).toEqual(
      expect.arrayContaining([createdFirstSession, createdSecondSession])
    )

    await expect(
      repository.deleteBySessionID(firstSession.sessionId)
    ).resolves.toEqual(createdFirstSession)
    await expect(
      repository.getBySessionID(firstSession.sessionId)
    ).resolves.toBeNull()
    await expect(repository.list()).resolves.toEqual([createdSecondSession])
  })

  it("returns null when a user session does not exist", async () => {
    const repository = createUserSessionRepository(testDb.db)

    await expect(
      repository.getBySessionID("9cdbdf3c-c4c0-48f4-8f91-c9b337d5f6df")
    ).resolves.toBeNull()
    await expect(
      repository.deleteBySessionID("9cdbdf3c-c4c0-48f4-8f91-c9b337d5f6df")
    ).resolves.toBeNull()
  })

  it("rejects duplicate session ids", async () => {
    const repository = createUserSessionRepository(testDb.db)

    await testDb.db.insertInto("user_profile").values(userProfile).execute()
    await repository.create({
      sessionId: "3783ac06-42be-43d4-bad3-6aa2c5c5363d",
      userId: userProfile.id,
      sourceIp: "203.0.113.10",
      userAgent: "Mozilla/5.0",
      createdAt: new Date("2026-04-23T08:00:00.000Z"),
      expiresAt: new Date("2026-04-23T10:00:00.000Z")
    })

    await expect(
      repository.create({
        sessionId: "3783ac06-42be-43d4-bad3-6aa2c5c5363d",
        userId: userProfile.id,
        sourceIp: "203.0.113.11",
        userAgent: "curl/8.0.1",
        createdAt: new Date("2026-04-23T09:00:00.000Z"),
        expiresAt: new Date("2026-04-23T11:00:00.000Z")
      })
    ).rejects.toThrow()
  })

  it("deletes sessions when the owning user profile is deleted", async () => {
    const repository = createUserSessionRepository(testDb.db)

    await testDb.db.insertInto("user_profile").values(userProfile).execute()
    await repository.create({
      sessionId: "3783ac06-42be-43d4-bad3-6aa2c5c5363d",
      userId: userProfile.id,
      sourceIp: "203.0.113.10",
      userAgent: "Mozilla/5.0",
      createdAt: new Date("2026-04-23T08:00:00.000Z"),
      expiresAt: new Date("2026-04-23T10:00:00.000Z")
    })

    await testDb.db
      .deleteFrom("user_profile")
      .where("id", "=", userProfile.id)
      .execute()

    await expect(
      repository.getBySessionID("3783ac06-42be-43d4-bad3-6aa2c5c5363d")
    ).resolves.toBeNull()
    await expect(repository.list()).resolves.toEqual([])
  })
})
