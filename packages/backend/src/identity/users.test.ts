import { builtInRoleIds } from "@exposurenexus/contracts/model/rbac";
import { pino } from "pino";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { UpdateUserProfile } from "@exposurenexus/contracts/model/user";

const { hashPlaintextPasswordMock } = vi.hoisted(() => ({
  hashPlaintextPasswordMock: vi.fn(),
}));

vi.mock("./password.js", () => ({
  hashPlaintextPassword: hashPlaintextPasswordMock,
}));

import { createUsers } from "./users.js";

import type { ApplicationError } from "../application-error.js";

const performedBy = "95d5909c-a9ab-4350-a515-4b89eb1065ae";
const firstProfile = {
  id: "a7d3ef96-d3b4-48bb-8386-681eb3be7b12",
  username: "alice",
  displayName: "Alice Example",
  email: "alice@example.com",
  enabled: true,
  passwordHash: "hash-alice",
  roleIds: [builtInRoleIds.viewer],
};
const secondProfile = {
  id: "4fa42fa9-3ff9-48d4-9150-34681f393885",
  username: "bob",
  displayName: "Bob Example",
  email: "bob@example.com",
  enabled: false,
  passwordHash: "hash-bob",
  roleIds: [builtInRoleIds.editor],
};
const publicFirstProfile = {
  id: firstProfile.id,
  username: firstProfile.username,
  displayName: firstProfile.displayName,
  email: firstProfile.email,
  enabled: firstProfile.enabled,
  roleIds: firstProfile.roleIds,
};
const userProfileRepository = {
  list: vi.fn(),
  getByID: vi.fn(),
  getByUsername: vi.fn(),
  create: vi.fn(),
  updateByID: vi.fn(),
};
const logger = pino({ enabled: false });

function createService() {
  return createUsers({ userProfileRepository, logger });
}

function updatePayload(overrides: Partial<UpdateUserProfile> = {}): UpdateUserProfile {
  return {
    displayName: firstProfile.displayName,
    email: firstProfile.email,
    enabled: firstProfile.enabled,
    roleIds: firstProfile.roleIds,
    ...overrides,
  };
}

describe("identity users", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hashPlaintextPasswordMock.mockResolvedValue("argon2-password-hash");
  });

  it("returns public user profiles without password hashes", async () => {
    userProfileRepository.list.mockResolvedValue([firstProfile, secondProfile]);
    userProfileRepository.getByID.mockResolvedValue(firstProfile);
    userProfileRepository.getByUsername.mockResolvedValue(secondProfile);
    const users = createService();

    const listed = await users.listAll();
    await expect(users.getByID(firstProfile.id)).resolves.toEqual(publicFirstProfile);
    await expect(users.getByUsername(secondProfile.username)).resolves.toEqual({
      id: secondProfile.id,
      username: secondProfile.username,
      displayName: secondProfile.displayName,
      email: secondProfile.email,
      enabled: secondProfile.enabled,
      roleIds: secondProfile.roleIds,
    });
    expect(listed).toHaveLength(2);
    expect(listed[0]).not.toHaveProperty("passwordHash");
    expect(listed[1]).not.toHaveProperty("passwordHash");
  });

  it("returns null for missing ids and usernames", async () => {
    userProfileRepository.getByID.mockResolvedValue(null);
    userProfileRepository.getByUsername.mockResolvedValue(null);
    const users = createService();

    await expect(users.getByID(firstProfile.id)).resolves.toBeNull();
    await expect(users.getByUsername(firstProfile.username)).resolves.toBeNull();
  });

  it.each([
    ["listAll", "list", "user_profile.list_failed", undefined],
    ["getByID", "getByID", "user_profile.get_failed", firstProfile.id],
    [
      "getByUsername",
      "getByUsername",
      "user_profile.get_by_username_failed",
      firstProfile.username,
    ],
  ] as const)("maps %s persistence failures", async (method, repositoryMethod, code, argument) => {
    userProfileRepository[repositoryMethod].mockRejectedValue(new Error("db offline"));
    const users = createService();

    await expect(
      (users[method] as (value?: string) => Promise<unknown>)(argument),
    ).rejects.toMatchObject({ code, kind: "unexpected" });
  });

  it("hashes passwords and returns a safe creation outcome", async () => {
    const userProfile = {
      username: firstProfile.username,
      displayName: firstProfile.displayName,
      email: firstProfile.email,
      enabled: firstProfile.enabled,
      roleIds: [builtInRoleIds.viewer, builtInRoleIds.admin],
      password: "correct-horse-battery-staple",
    };
    const createdProfile = {
      ...firstProfile,
      passwordHash: "argon2-password-hash",
      roleIds: userProfile.roleIds,
    };
    userProfileRepository.create.mockResolvedValue(createdProfile);

    const outcome = await createService().create({ userProfile, performedBy });

    expect(outcome).toEqual({
      current: {
        ...publicFirstProfile,
        roleIds: userProfile.roleIds,
      },
      performedBy,
    });
    expect(outcome.current).not.toHaveProperty("passwordHash");
    expect(hashPlaintextPasswordMock).toHaveBeenCalledWith(userProfile.password);
    expect(userProfileRepository.create).toHaveBeenCalledWith(
      {
        username: userProfile.username,
        displayName: userProfile.displayName,
        email: userProfile.email,
        enabled: userProfile.enabled,
        passwordHash: "argon2-password-hash",
      },
      userProfile.roleIds,
    );
  });

  it("maps duplicate profiles and unknown role assignments", async () => {
    const userProfile = {
      username: firstProfile.username,
      displayName: firstProfile.displayName,
      email: firstProfile.email,
      enabled: firstProfile.enabled,
      roleIds: [builtInRoleIds.viewer],
      password: "correct-horse-battery-staple",
    };
    const users = createService();

    userProfileRepository.create.mockRejectedValueOnce(
      Object.assign(new Error("duplicate key value"), { code: "23505" }),
    );
    await expect(users.create({ userProfile, performedBy })).rejects.toMatchObject({
      code: "user_profile.create_conflict",
      kind: "conflict",
      details: { username: userProfile.username, email: userProfile.email },
    } satisfies Partial<ApplicationError>);

    userProfileRepository.create.mockRejectedValueOnce(
      Object.assign(new Error("violates foreign key constraint"), { code: "23503" }),
    );
    await expect(users.create({ userProfile, performedBy })).rejects.toMatchObject({
      code: "user_profile.role_assignment_invalid",
      kind: "validation",
      details: { roleIds: userProfile.roleIds },
    } satisfies Partial<ApplicationError>);
  });

  it("returns safe update facts and revokes sessions for sensitive changes", async () => {
    const updatedProfile = {
      ...firstProfile,
      displayName: "Alice Updated",
      enabled: false,
      roleIds: [builtInRoleIds.admin],
    };
    userProfileRepository.getByID.mockResolvedValue(firstProfile);
    userProfileRepository.updateByID.mockResolvedValue({
      userProfile: updatedProfile,
      revokedSessionCount: 2,
    });

    const outcome = await createService().updateByID({
      id: firstProfile.id,
      userProfile: updatePayload({
        displayName: updatedProfile.displayName,
        enabled: false,
        roleIds: updatedProfile.roleIds,
      }),
      performedBy,
    });

    expect(outcome).toEqual({
      previous: publicFirstProfile,
      current: {
        ...publicFirstProfile,
        displayName: updatedProfile.displayName,
        enabled: false,
        roleIds: updatedProfile.roleIds,
      },
      performedBy,
    });
    expect(outcome?.previous).not.toHaveProperty("passwordHash");
    expect(outcome?.current).not.toHaveProperty("passwordHash");
    expect(userProfileRepository.updateByID).toHaveBeenCalledWith({
      id: firstProfile.id,
      userProfile: {
        username: firstProfile.username,
        displayName: updatedProfile.displayName,
        email: firstProfile.email,
        enabled: false,
        passwordHash: firstProfile.passwordHash,
      },
      roleIds: updatedProfile.roleIds,
      revokeSessions: true,
    });
  });

  it("hashes replacement passwords and revokes sessions", async () => {
    const updatedProfile = { ...firstProfile, passwordHash: "argon2-password-hash" };
    userProfileRepository.getByID.mockResolvedValue(firstProfile);
    userProfileRepository.updateByID.mockResolvedValue({
      userProfile: updatedProfile,
      revokedSessionCount: 1,
    });

    await createService().updateByID({
      id: firstProfile.id,
      userProfile: updatePayload({ password: "new-password" }),
      performedBy,
    });

    expect(hashPlaintextPasswordMock).toHaveBeenCalledWith("new-password");
    expect(userProfileRepository.updateByID).toHaveBeenCalledWith(
      expect.objectContaining({
        userProfile: expect.objectContaining({ passwordHash: "argon2-password-hash" }),
        revokeSessions: true,
      }),
    );
  });

  it("does not revoke sessions for non-sensitive profile changes", async () => {
    const updatedProfile = { ...firstProfile, displayName: "Alice Updated" };
    userProfileRepository.getByID.mockResolvedValue(firstProfile);
    userProfileRepository.updateByID.mockResolvedValue({
      userProfile: updatedProfile,
      revokedSessionCount: 0,
    });

    await createService().updateByID({
      id: firstProfile.id,
      userProfile: updatePayload({ displayName: updatedProfile.displayName }),
      performedBy,
    });

    expect(userProfileRepository.updateByID).toHaveBeenCalledWith(
      expect.objectContaining({ revokeSessions: false }),
    );
  });

  it("returns null when an update target is missing or loses a deletion race", async () => {
    userProfileRepository.getByID.mockResolvedValueOnce(null).mockResolvedValueOnce(firstProfile);
    userProfileRepository.updateByID.mockResolvedValue(null);
    const users = createService();
    const command = {
      id: firstProfile.id,
      userProfile: updatePayload(),
      performedBy,
    };

    await expect(users.updateByID(command)).resolves.toBeNull();
    await expect(users.updateByID(command)).resolves.toBeNull();
  });

  it("preserves update conflict and role assignment errors", async () => {
    userProfileRepository.getByID.mockResolvedValue(firstProfile);
    const command = {
      id: firstProfile.id,
      userProfile: updatePayload(),
      performedBy,
    };
    const users = createService();

    userProfileRepository.updateByID.mockRejectedValueOnce(
      Object.assign(new Error("duplicate key value"), { code: "23505" }),
    );
    await expect(users.updateByID(command)).rejects.toMatchObject({
      code: "user_profile.update_conflict",
      kind: "conflict",
      details: { userProfileId: firstProfile.id },
    } satisfies Partial<ApplicationError>);

    userProfileRepository.updateByID.mockRejectedValueOnce(
      Object.assign(new Error("foreign key violation"), { code: "23503" }),
    );
    await expect(users.updateByID(command)).rejects.toMatchObject({
      code: "user_profile.role_assignment_invalid",
      kind: "validation",
      details: { userProfileId: firstProfile.id, roleIds: firstProfile.roleIds },
    } satisfies Partial<ApplicationError>);
  });
});
