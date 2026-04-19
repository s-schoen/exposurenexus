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
    const firstUserRecord = {
      id: "72fb3d48-4f34-4ec4-b7cd-9f68f5f4d19f",
      name: "Alice Example",
      email: "alice@example.com",
      emailVerified: true,
      image: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      username: "alice",
      displayUsername: "Alice",
      role: null
    }
    const secondUserRecord = {
      id: "05aa7671-ef43-4cd1-bf4c-76ca2c33b4ab",
      name: "Bob Example",
      email: "bob@example.com",
      emailVerified: false,
      image: "https://example.com/avatar.png",
      createdAt: new Date("2026-01-02T00:00:00.000Z"),
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
      username: "bob",
      displayUsername: "Bob",
      role: null
    }
    const firstUser = {
      id: firstUserRecord.id,
      name: firstUserRecord.name,
      email: firstUserRecord.email,
      emailVerified: firstUserRecord.emailVerified,
      image: firstUserRecord.image,
      createdAt: firstUserRecord.createdAt,
      updatedAt: firstUserRecord.updatedAt,
      username: firstUserRecord.username,
      displayUsername: firstUserRecord.displayUsername,
      roleNames: []
    }
    const secondUser = {
      id: secondUserRecord.id,
      name: secondUserRecord.name,
      email: secondUserRecord.email,
      emailVerified: secondUserRecord.emailVerified,
      image: secondUserRecord.image,
      createdAt: secondUserRecord.createdAt,
      updatedAt: secondUserRecord.updatedAt,
      username: secondUserRecord.username,
      displayUsername: secondUserRecord.displayUsername,
      roleNames: []
    }

    await testDb.db
      .insertInto("user")
      .values([firstUserRecord, secondUserRecord])
      .execute()

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
    const userRecord = {
      id: "72fb3d48-4f34-4ec4-b7cd-9f68f5f4d19f",
      name: "Alice Example",
      email: "alice@example.com",
      emailVerified: true,
      image: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      username: "alice",
      displayUsername: "Alice",
      role: null
    }
    const user = {
      id: userRecord.id,
      name: userRecord.name,
      email: userRecord.email,
      emailVerified: userRecord.emailVerified,
      image: userRecord.image,
      createdAt: userRecord.createdAt,
      updatedAt: userRecord.updatedAt,
      username: userRecord.username,
      displayUsername: userRecord.displayUsername,
      roleNames: []
    }
    const updatedAt = new Date("2026-02-03T04:05:06.000Z")

    await testDb.db.insertInto("user").values(userRecord).execute()

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

  it("maps persisted auth roles to persisted role names", async () => {
    const repository = createUserRepository(testDb.db)
    const viewerUser = {
      id: "c73bdfe4-b29c-4c9d-a452-45188d59f845",
      name: "Viewer User",
      email: "viewer@example.com",
      emailVerified: true,
      image: null,
      createdAt: new Date("2026-01-03T00:00:00.000Z"),
      updatedAt: new Date("2026-01-03T00:00:00.000Z"),
      username: "viewer",
      displayUsername: "Viewer",
      role: "viewer"
    }
    const editorViewerUser = {
      id: "6de54db7-1828-4af8-ba2f-e5385676d499",
      name: "Editor Viewer User",
      email: "editor-viewer@example.com",
      emailVerified: true,
      image: null,
      createdAt: new Date("2026-01-04T00:00:00.000Z"),
      updatedAt: new Date("2026-01-04T00:00:00.000Z"),
      username: "editor-viewer",
      displayUsername: "Editor Viewer",
      role: "viewer,editor"
    }
    const noRoleUser = {
      id: "d95bcf08-d3e8-4b19-b6f8-3b3f20fd7ad7",
      name: "No Role User",
      email: "no-role@example.com",
      emailVerified: false,
      image: null,
      createdAt: new Date("2026-01-05T00:00:00.000Z"),
      updatedAt: new Date("2026-01-05T00:00:00.000Z"),
      username: "no-role",
      displayUsername: "No Role",
      role: null
    }

    await testDb.db
      .insertInto("user")
      .values([viewerUser, editorViewerUser, noRoleUser])
      .execute()

    await expect(repository.getByID(viewerUser.id)).resolves.toEqual({
      id: viewerUser.id,
      name: viewerUser.name,
      email: viewerUser.email,
      emailVerified: viewerUser.emailVerified,
      image: viewerUser.image,
      createdAt: viewerUser.createdAt,
      updatedAt: viewerUser.updatedAt,
      username: viewerUser.username,
      displayUsername: viewerUser.displayUsername,
      roleNames: ["viewer"]
    })
    await expect(repository.getByID(editorViewerUser.id)).resolves.toEqual({
      id: editorViewerUser.id,
      name: editorViewerUser.name,
      email: editorViewerUser.email,
      emailVerified: editorViewerUser.emailVerified,
      image: editorViewerUser.image,
      createdAt: editorViewerUser.createdAt,
      updatedAt: editorViewerUser.updatedAt,
      username: editorViewerUser.username,
      displayUsername: editorViewerUser.displayUsername,
      roleNames: ["viewer", "editor"]
    })
    await expect(repository.getByID(noRoleUser.id)).resolves.toEqual({
      id: noRoleUser.id,
      name: noRoleUser.name,
      email: noRoleUser.email,
      emailVerified: noRoleUser.emailVerified,
      image: noRoleUser.image,
      createdAt: noRoleUser.createdAt,
      updatedAt: noRoleUser.updatedAt,
      username: noRoleUser.username,
      displayUsername: noRoleUser.displayUsername,
      roleNames: []
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

  it("updates profile fields without changing persisted role names", async () => {
    const repository = createUserRepository(testDb.db)
    const userRecord = {
      id: "72fb3d48-4f34-4ec4-b7cd-9f68f5f4d19f",
      name: "Alice Example",
      email: "alice@example.com",
      emailVerified: true,
      image: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      username: "alice",
      displayUsername: "Alice",
      role: null
    }

    await testDb.db.insertInto("user").values(userRecord).execute()

    await expect(
      repository.updateByID(userRecord.id, {
        name: userRecord.name,
        email: userRecord.email,
        displayUsername: userRecord.displayUsername,
        image: userRecord.image,
        updatedAt: new Date("2026-02-03T04:05:06.000Z")
      })
    ).resolves.toEqual({
      id: userRecord.id,
      name: userRecord.name,
      email: userRecord.email,
      emailVerified: userRecord.emailVerified,
      image: userRecord.image,
      createdAt: userRecord.createdAt,
      updatedAt: new Date("2026-02-03T04:05:06.000Z"),
      username: userRecord.username,
      displayUsername: userRecord.displayUsername,
      roleNames: []
    })

    await expect(repository.getByID(userRecord.id)).resolves.toEqual({
      id: userRecord.id,
      name: userRecord.name,
      email: userRecord.email,
      emailVerified: userRecord.emailVerified,
      image: userRecord.image,
      createdAt: userRecord.createdAt,
      updatedAt: new Date("2026-02-03T04:05:06.000Z"),
      username: userRecord.username,
      displayUsername: userRecord.displayUsername,
      roleNames: []
    })
  })
})
