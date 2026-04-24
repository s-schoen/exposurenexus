import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest"
import { createUserProfileRepository } from "./user-profile.js"
import { createTestDatabase, resetTestDatabase } from "../test/db.js"

vi.mock("../db/index.js", () => ({
  db: {},
  logger: {},
  pool: {}
}))

describe("user profile repository", () => {
  const testDb = createTestDatabase()
  const firstProfile = {
    id: "a7d3ef96-d3b4-48bb-8386-681eb3be7b12",
    username: "alice",
    displayName: "Alice Example",
    email: "alice@example.com",
    enabled: true,
    passwordHash: "hash-alice"
  }
  const secondProfile = {
    id: "4fa42fa9-3ff9-48d4-9150-34681f393885",
    username: "bob",
    displayName: "Bob Example",
    email: "bob@example.com",
    enabled: false,
    passwordHash: "hash-bob"
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

  it("creates, lists, loads, updates, and deletes user profiles", async () => {
    const repository = createUserProfileRepository(testDb.db)

    await expect(repository.create(firstProfile)).resolves.toEqual(firstProfile)
    await expect(repository.create(secondProfile)).resolves.toEqual(
      secondProfile
    )

    await expect(repository.getByID(firstProfile.id)).resolves.toEqual(
      firstProfile
    )
    await expect(
      repository.getByUsername(secondProfile.username)
    ).resolves.toEqual(secondProfile)

    const profiles = await repository.list()

    expect(profiles).toHaveLength(2)
    expect(profiles).toEqual(
      expect.arrayContaining([firstProfile, secondProfile])
    )

    const updatedFirstProfile = {
      ...firstProfile,
      username: "alice-updated",
      displayName: "Alice Updated",
      email: "alice.updated@example.com",
      enabled: false,
      passwordHash: "hash-alice-updated"
    }

    await expect(
      repository.update(firstProfile.id, {
        username: updatedFirstProfile.username,
        displayName: updatedFirstProfile.displayName,
        email: updatedFirstProfile.email,
        enabled: updatedFirstProfile.enabled,
        passwordHash: updatedFirstProfile.passwordHash
      })
    ).resolves.toEqual(updatedFirstProfile)

    await expect(repository.getByID(firstProfile.id)).resolves.toEqual(
      updatedFirstProfile
    )
    await expect(
      repository.getByUsername(firstProfile.username)
    ).resolves.toBeNull()
    await expect(
      repository.getByUsername(updatedFirstProfile.username)
    ).resolves.toEqual(updatedFirstProfile)

    await expect(repository.deleteByID(secondProfile.id)).resolves.toEqual(
      secondProfile
    )
    await expect(repository.getByID(secondProfile.id)).resolves.toBeNull()
    await expect(repository.list()).resolves.toEqual([updatedFirstProfile])
  })

  it("returns null when a user profile does not exist", async () => {
    const repository = createUserProfileRepository(testDb.db)
    const unknownID = "ef2fb643-53e3-4b0c-9b68-253d0dd43f8f"

    await expect(repository.getByID(unknownID)).resolves.toBeNull()
    await expect(repository.getByUsername("missing-user")).resolves.toBeNull()
  })

  it("returns null when updating a user profile that does not exist", async () => {
    const repository = createUserProfileRepository(testDb.db)

    await expect(
      repository.update("ef2fb643-53e3-4b0c-9b68-253d0dd43f8f", {
        username: "missing-user",
        displayName: "Missing User",
        email: "missing@example.com",
        enabled: true,
        passwordHash: "hash-missing"
      })
    ).resolves.toBeNull()
  })

  it("returns null when deleting a user profile that does not exist", async () => {
    const repository = createUserProfileRepository(testDb.db)

    await expect(
      repository.deleteByID("ef2fb643-53e3-4b0c-9b68-253d0dd43f8f")
    ).resolves.toBeNull()
  })

  it("rejects duplicate usernames", async () => {
    const repository = createUserProfileRepository(testDb.db)

    await repository.create(firstProfile)

    await expect(
      repository.create({
        ...secondProfile,
        username: firstProfile.username
      })
    ).rejects.toThrow()
  })

  it("rejects duplicate email addresses", async () => {
    const repository = createUserProfileRepository(testDb.db)

    await repository.create(firstProfile)

    await expect(
      repository.create({
        ...secondProfile,
        email: firstProfile.email
      })
    ).rejects.toThrow()
  })
})
