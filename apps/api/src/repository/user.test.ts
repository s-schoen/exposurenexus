import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest"
import { createUserRepository } from "./user.js"
import { createTestDatabase, resetTestDatabase } from "../test/db.js"

vi.mock("../db/index.js", () => ({
  db: {},
  logger: {},
  pool: {}
}))

describe("user repository", () => {
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

  it("lists all users and returns users by id against a real database", async () => {
    const repository = createUserRepository(testDb.db)
    const firstUser = {
      id: "72fb3d48-4f34-4ec4-b7cd-9f68f5f4d19f",
      name: "Alice Example",
      email: "alice@example.com",
      emailVerified: true,
      image: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      username: "alice",
      displayUsername: "Alice"
    }
    const secondUser = {
      id: "05aa7671-ef43-4cd1-bf4c-76ca2c33b4ab",
      name: "Bob Example",
      email: "bob@example.com",
      emailVerified: false,
      image: "https://example.com/avatar.png",
      createdAt: new Date("2026-01-02T00:00:00.000Z"),
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
      username: "bob",
      displayUsername: "Bob"
    }

    await testDb.db.insertInto("user").values([firstUser, secondUser]).execute()

    await expect(repository.getByID(firstUser.id)).resolves.toEqual(firstUser)
    await expect(repository.getByID(secondUser.id)).resolves.toEqual(secondUser)

    const users = await repository.list()

    expect(users).toHaveLength(2)
    expect(users).toEqual(expect.arrayContaining([firstUser, secondUser]))
  })

  it("returns null when a user does not exist", async () => {
    const repository = createUserRepository(testDb.db)

    await expect(
      repository.getByID("72fb3d48-4f34-4ec4-b7cd-9f68f5f4d19e")
    ).resolves.toBeNull()
  })

  it("updates a user by id", async () => {
    const repository = createUserRepository(testDb.db)
    const user = {
      id: "72fb3d48-4f34-4ec4-b7cd-9f68f5f4d19f",
      name: "Alice Example",
      email: "alice@example.com",
      emailVerified: true,
      image: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      username: "alice",
      displayUsername: "Alice"
    }
    const updatedAt = new Date("2026-02-03T04:05:06.000Z")

    await testDb.db.insertInto("user").values(user).execute()

    await expect(
      repository.updateByID(user.id, {
        name: "Alice Updated",
        email: "alice.updated@example.com",
        displayUsername: "Alice Updated",
        image: "https://example.com/alice.png",
        updatedAt
      })
    ).resolves.toEqual({
      ...user,
      name: "Alice Updated",
      email: "alice.updated@example.com",
      displayUsername: "Alice Updated",
      image: "https://example.com/alice.png",
      updatedAt
    })
  })

  it("returns null when updating a user that does not exist", async () => {
    const repository = createUserRepository(testDb.db)

    await expect(
      repository.updateByID("72fb3d48-4f34-4ec4-b7cd-9f68f5f4d19e", {
        name: "Alice Updated",
        email: "alice.updated@example.com",
        displayUsername: "Alice Updated",
        image: null,
        updatedAt: new Date("2026-02-03T04:05:06.000Z")
      })
    ).resolves.toBeNull()
  })
})
