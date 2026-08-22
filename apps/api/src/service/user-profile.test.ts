import { builtInRoleIds } from "@exposurenexus/contracts/model/rbac";
import { pino } from "pino";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { UpdateUserProfile } from "@exposurenexus/contracts/model/user";

const { hashPlaintextPasswordMock } = vi.hoisted(() => ({
  hashPlaintextPasswordMock: vi.fn(),
}));

vi.mock("../lib/argon2.js", () => ({
  hashPlaintextPassword: hashPlaintextPasswordMock,
}));

import { createDomainEventCollector } from "../test/eventbus.js";
import { createUserProfileService } from "./user-profile.js";

import type { ApplicationError } from "./application-error.js";

describe("user profile service", () => {
  const userProfileRepository = {
    list: vi.fn(),
    getByID: vi.fn(),
    getByUsername: vi.fn(),
    create: vi.fn(),
    updateByID: vi.fn(),
    deleteByID: vi.fn(),
  };
  const domainEvents = createDomainEventCollector();
  const logger = pino({ enabled: false });
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

  beforeEach(() => {
    vi.clearAllMocks();
    domainEvents.clear();
    hashPlaintextPasswordMock.mockResolvedValue("argon2-password-hash");
  });

  function createService() {
    return createUserProfileService({
      userProfileRepository,
      domainEventEmitter: domainEvents.emitter,
      logger,
    });
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

  it("lists all user profiles without exposing password hashes", async () => {
    const service = createService();

    userProfileRepository.list.mockResolvedValue([firstProfile, secondProfile]);

    await expect(service.listAll()).resolves.toEqual([
      {
        id: firstProfile.id,
        username: firstProfile.username,
        displayName: firstProfile.displayName,
        email: firstProfile.email,
        enabled: firstProfile.enabled,
        roleIds: firstProfile.roleIds,
      },
      {
        id: secondProfile.id,
        username: secondProfile.username,
        displayName: secondProfile.displayName,
        email: secondProfile.email,
        enabled: secondProfile.enabled,
        roleIds: secondProfile.roleIds,
      },
    ]);
    expect(userProfileRepository.list).toHaveBeenCalledOnce();
  });

  it("maps list failures to an unexpected ApplicationError", async () => {
    const service = createService();

    userProfileRepository.list.mockRejectedValue(new Error("db offline"));

    await expect(service.listAll()).rejects.toMatchObject({
      code: "user_profile.list_failed",
      kind: "unexpected",
    } satisfies Partial<ApplicationError>);
  });

  it("returns a user profile by id without exposing the password hash", async () => {
    const service = createService();

    userProfileRepository.getByID.mockResolvedValue(firstProfile);

    await expect(service.getByID(firstProfile.id)).resolves.toEqual({
      id: firstProfile.id,
      username: firstProfile.username,
      displayName: firstProfile.displayName,
      email: firstProfile.email,
      enabled: firstProfile.enabled,
      roleIds: firstProfile.roleIds,
    });
    expect(userProfileRepository.getByID).toHaveBeenCalledWith(firstProfile.id);
  });

  it("returns null when a user profile id does not exist", async () => {
    const service = createService();
    const userProfileId = "ef2fb643-53e3-4b0c-9b68-253d0dd43f8f";

    userProfileRepository.getByID.mockResolvedValue(null);

    await expect(service.getByID(userProfileId)).resolves.toBeNull();
  });

  it("maps get-by-id failures to an unexpected ApplicationError", async () => {
    const service = createService();
    const userProfileId = "ef2fb643-53e3-4b0c-9b68-253d0dd43f8f";

    userProfileRepository.getByID.mockRejectedValue(new Error("db offline"));

    await expect(service.getByID(userProfileId)).rejects.toMatchObject({
      code: "user_profile.get_failed",
      kind: "unexpected",
      details: { userProfileId },
    } satisfies Partial<ApplicationError>);
  });

  it("returns a user profile by username without exposing the password hash", async () => {
    const service = createService();

    userProfileRepository.getByUsername.mockResolvedValue(secondProfile);

    await expect(service.getByUsername(secondProfile.username)).resolves.toEqual({
      id: secondProfile.id,
      username: secondProfile.username,
      displayName: secondProfile.displayName,
      email: secondProfile.email,
      enabled: secondProfile.enabled,
      roleIds: secondProfile.roleIds,
    });
    expect(userProfileRepository.getByUsername).toHaveBeenCalledWith(secondProfile.username);
  });

  it("returns null when a user profile username does not exist", async () => {
    const service = createService();

    userProfileRepository.getByUsername.mockResolvedValue(null);

    await expect(service.getByUsername("missing-user")).resolves.toBeNull();
  });

  it("maps get-by-username failures to an unexpected ApplicationError", async () => {
    const service = createService();

    userProfileRepository.getByUsername.mockRejectedValue(new Error("db offline"));

    await expect(service.getByUsername("alice")).rejects.toMatchObject({
      code: "user_profile.get_by_username_failed",
      kind: "unexpected",
      details: { username: "alice" },
    } satisfies Partial<ApplicationError>);
  });

  it("creates a user profile with a hashed password", async () => {
    const service = createService();
    const createdProfile = {
      ...firstProfile,
      passwordHash: "argon2-password-hash",
      roleIds: [builtInRoleIds.viewer, builtInRoleIds.admin],
    };
    const expectedUserProfile = {
      id: firstProfile.id,
      username: firstProfile.username,
      displayName: firstProfile.displayName,
      email: firstProfile.email,
      enabled: firstProfile.enabled,
      roleIds: [builtInRoleIds.viewer, builtInRoleIds.admin],
    };

    userProfileRepository.create.mockResolvedValue(createdProfile);

    await expect(
      service.create(
        {
          username: firstProfile.username,
          displayName: firstProfile.displayName,
          email: firstProfile.email,
          enabled: firstProfile.enabled,
          roleIds: [builtInRoleIds.viewer, builtInRoleIds.admin],
          password: "correct-horse-battery-staple",
        },
        {
          actor: "admin-user",
          correlationId: "users-create-request",
        },
      ),
    ).resolves.toEqual(expectedUserProfile);
    expect(hashPlaintextPasswordMock).toHaveBeenCalledWith("correct-horse-battery-staple");
    expect(userProfileRepository.create).toHaveBeenCalledWith(
      {
        username: firstProfile.username,
        displayName: firstProfile.displayName,
        email: firstProfile.email,
        enabled: firstProfile.enabled,
        passwordHash: "argon2-password-hash",
      },
      [builtInRoleIds.viewer, builtInRoleIds.admin],
    );
    expect(domainEvents.subjects()).toEqual(["user.created"]);
    expect(domainEvents.events[0]).toMatchObject({
      subject: "user.created",
      source: "user-profile",
      actor: "admin-user",
      correlationId: "users-create-request",
      data: {
        user: expectedUserProfile,
      },
    });
    const createdEvent = domainEvents.eventsFor("user.created")[0]!;
    expect(createdEvent.data.user).not.toHaveProperty("passwordHash");
  });

  it("maps create conflicts to a conflict ApplicationError", async () => {
    const service = createService();

    userProfileRepository.create.mockRejectedValue(
      Object.assign(new Error("duplicate key value"), { code: "23505" }),
    );

    await expect(
      service.create({
        username: firstProfile.username,
        displayName: firstProfile.displayName,
        email: firstProfile.email,
        enabled: firstProfile.enabled,
        roleIds: [builtInRoleIds.viewer],
        password: "correct-horse-battery-staple",
      }),
    ).rejects.toMatchObject({
      code: "user_profile.create_conflict",
      kind: "conflict",
      details: {
        username: firstProfile.username,
        email: firstProfile.email,
      },
    } satisfies Partial<ApplicationError>);
  });

  it("maps invalid create role assignments to a validation ApplicationError", async () => {
    const service = createService();

    userProfileRepository.create.mockRejectedValue(
      Object.assign(new Error("violates foreign key constraint"), {
        code: "23503",
      }),
    );

    await expect(
      service.create({
        username: firstProfile.username,
        displayName: firstProfile.displayName,
        email: firstProfile.email,
        enabled: firstProfile.enabled,
        roleIds: ["9d9e119a-9c9a-41b0-b2fe-c40a05c45be7"],
        password: "correct-horse-battery-staple",
      }),
    ).rejects.toMatchObject({
      code: "user_profile.role_assignment_invalid",
      kind: "validation",
      details: { roleIds: ["9d9e119a-9c9a-41b0-b2fe-c40a05c45be7"] },
    } satisfies Partial<ApplicationError>);
  });

  it("maps create failures to an unexpected ApplicationError", async () => {
    const service = createService();

    hashPlaintextPasswordMock.mockRejectedValue(new Error("crypto unavailable"));

    await expect(
      service.create({
        username: firstProfile.username,
        displayName: firstProfile.displayName,
        email: firstProfile.email,
        enabled: firstProfile.enabled,
        roleIds: [builtInRoleIds.viewer],
        password: "correct-horse-battery-staple",
      }),
    ).rejects.toMatchObject({
      code: "user_profile.create_failed",
      kind: "unexpected",
      details: {
        username: firstProfile.username,
        email: firstProfile.email,
      },
    } satisfies Partial<ApplicationError>);
  });

  it("replaces a user profile while preserving service-owned fields", async () => {
    const service = createService();
    const updatedProfile = {
      ...firstProfile,
      displayName: "Alice Updated",
      enabled: false,
      roleIds: [builtInRoleIds.admin],
    };
    const expectedPreviousUserProfile = {
      id: firstProfile.id,
      username: firstProfile.username,
      displayName: firstProfile.displayName,
      email: firstProfile.email,
      enabled: firstProfile.enabled,
      roleIds: firstProfile.roleIds,
    };
    const expectedUpdatedUserProfile = {
      id: firstProfile.id,
      username: firstProfile.username,
      displayName: "Alice Updated",
      email: firstProfile.email,
      enabled: false,
      roleIds: [builtInRoleIds.admin],
    };

    userProfileRepository.getByID.mockResolvedValue(firstProfile);
    userProfileRepository.updateByID.mockResolvedValue({
      userProfile: updatedProfile,
      revokedSessionCount: 2,
    });

    await expect(
      service.updateByID({
        id: firstProfile.id,
        userProfile: updatePayload({
          displayName: "Alice Updated",
          enabled: false,
          roleIds: [builtInRoleIds.admin],
        }),
        eventContext: {
          actor: "admin-user",
          correlationId: "users-update-request",
        },
      }),
    ).resolves.toEqual(expectedUpdatedUserProfile);
    expect(hashPlaintextPasswordMock).not.toHaveBeenCalled();
    expect(userProfileRepository.updateByID).toHaveBeenCalledWith({
      id: firstProfile.id,
      userProfile: {
        username: firstProfile.username,
        displayName: "Alice Updated",
        email: firstProfile.email,
        enabled: false,
        passwordHash: firstProfile.passwordHash,
      },
      roleIds: [builtInRoleIds.admin],
      revokeSessions: true,
    });
    expect(domainEvents.subjects()).toEqual(["user.updated"]);
    expect(domainEvents.events[0]).toMatchObject({
      subject: "user.updated",
      source: "user-profile",
      actor: "admin-user",
      correlationId: "users-update-request",
      data: {
        previous: expectedPreviousUserProfile,
        current: expectedUpdatedUserProfile,
      },
    });
    const updatedEvent = domainEvents.eventsFor("user.updated")[0]!;
    expect(updatedEvent.data.previous).not.toHaveProperty("passwordHash");
    expect(updatedEvent.data.current).not.toHaveProperty("passwordHash");
  });

  it("updates a user profile password when provided", async () => {
    const service = createService();
    const updatedProfile = {
      ...firstProfile,
      passwordHash: "argon2-password-hash",
    };

    userProfileRepository.getByID.mockResolvedValue(firstProfile);
    userProfileRepository.updateByID.mockResolvedValue({
      userProfile: updatedProfile,
      revokedSessionCount: 1,
    });

    await expect(
      service.updateByID({
        id: firstProfile.id,
        userProfile: updatePayload({
          password: "new-correct-horse-battery-staple",
          roleIds: [],
        }),
      }),
    ).resolves.toEqual({
      id: firstProfile.id,
      username: firstProfile.username,
      displayName: firstProfile.displayName,
      email: firstProfile.email,
      enabled: firstProfile.enabled,
      roleIds: firstProfile.roleIds,
    });
    expect(hashPlaintextPasswordMock).toHaveBeenCalledWith("new-correct-horse-battery-staple");
    expect(userProfileRepository.updateByID).toHaveBeenCalledWith({
      id: firstProfile.id,
      userProfile: {
        username: firstProfile.username,
        displayName: firstProfile.displayName,
        email: firstProfile.email,
        enabled: firstProfile.enabled,
        passwordHash: "argon2-password-hash",
      },
      roleIds: [],
      revokeSessions: true,
    });
  });

  it("revokes sessions when disabling a user profile", async () => {
    const service = createService();
    const updatedProfile = {
      ...firstProfile,
      enabled: false,
    };

    userProfileRepository.getByID.mockResolvedValue(firstProfile);
    userProfileRepository.updateByID.mockResolvedValue({
      userProfile: updatedProfile,
      revokedSessionCount: 1,
    });

    await expect(
      service.updateByID({
        id: firstProfile.id,
        userProfile: updatePayload({
          enabled: false,
          roleIds: firstProfile.roleIds,
        }),
      }),
    ).resolves.toEqual({
      id: firstProfile.id,
      username: firstProfile.username,
      displayName: firstProfile.displayName,
      email: firstProfile.email,
      enabled: false,
      roleIds: firstProfile.roleIds,
    });
    expect(userProfileRepository.updateByID).toHaveBeenCalledWith({
      id: firstProfile.id,
      userProfile: {
        username: firstProfile.username,
        displayName: firstProfile.displayName,
        email: firstProfile.email,
        enabled: false,
        passwordHash: firstProfile.passwordHash,
      },
      roleIds: firstProfile.roleIds,
      revokeSessions: true,
    });
  });

  it("does not revoke sessions for non-sensitive user profile updates", async () => {
    const service = createService();
    const updatedProfile = {
      ...firstProfile,
      displayName: "Alice Updated",
    };

    userProfileRepository.getByID.mockResolvedValue(firstProfile);
    userProfileRepository.updateByID.mockResolvedValue({
      userProfile: updatedProfile,
      revokedSessionCount: 0,
    });

    await expect(
      service.updateByID({
        id: firstProfile.id,
        userProfile: updatePayload({
          displayName: "Alice Updated",
          roleIds: [...firstProfile.roleIds].reverse(),
        }),
      }),
    ).resolves.toEqual({
      id: firstProfile.id,
      username: firstProfile.username,
      displayName: "Alice Updated",
      email: firstProfile.email,
      enabled: firstProfile.enabled,
      roleIds: firstProfile.roleIds,
    });
    expect(userProfileRepository.updateByID).toHaveBeenCalledWith({
      id: firstProfile.id,
      userProfile: {
        username: firstProfile.username,
        displayName: "Alice Updated",
        email: firstProfile.email,
        enabled: firstProfile.enabled,
        passwordHash: firstProfile.passwordHash,
      },
      roleIds: firstProfile.roleIds,
      revokeSessions: false,
    });
  });

  it("returns null when updating a user profile that does not exist", async () => {
    const service = createService();
    const userProfileId = "ef2fb643-53e3-4b0c-9b68-253d0dd43f8f";

    userProfileRepository.getByID.mockResolvedValue(null);

    await expect(
      service.updateByID({
        id: userProfileId,
        userProfile: updatePayload({
          displayName: "Missing User",
          roleIds: [],
        }),
      }),
    ).resolves.toBeNull();
    expect(userProfileRepository.updateByID).not.toHaveBeenCalled();
    expect(domainEvents.subjects()).toEqual([]);
  });

  it("returns null when update no longer finds the user profile", async () => {
    const service = createService();

    userProfileRepository.getByID.mockResolvedValue(firstProfile);
    userProfileRepository.updateByID.mockResolvedValue(null);

    await expect(
      service.updateByID({
        id: firstProfile.id,
        userProfile: updatePayload({
          displayName: "Alice Updated",
          roleIds: firstProfile.roleIds,
        }),
      }),
    ).resolves.toBeNull();
    expect(domainEvents.subjects()).toEqual([]);
  });

  it("maps update conflicts to a conflict ApplicationError", async () => {
    const service = createService();

    userProfileRepository.getByID.mockResolvedValue(firstProfile);
    userProfileRepository.updateByID.mockRejectedValue(
      Object.assign(new Error("duplicate key value"), { code: "23505" }),
    );

    await expect(
      service.updateByID({
        id: firstProfile.id,
        userProfile: updatePayload({
          email: secondProfile.email,
          roleIds: secondProfile.roleIds,
        }),
      }),
    ).rejects.toMatchObject({
      code: "user_profile.update_conflict",
      kind: "conflict",
      details: { userProfileId: firstProfile.id },
    } satisfies Partial<ApplicationError>);
  });

  it("maps invalid update role assignments to a validation ApplicationError", async () => {
    const service = createService();

    userProfileRepository.getByID.mockResolvedValue(firstProfile);
    userProfileRepository.updateByID.mockRejectedValue(
      Object.assign(new Error("violates foreign key constraint"), {
        code: "23503",
      }),
    );

    await expect(
      service.updateByID({
        id: firstProfile.id,
        userProfile: updatePayload({
          roleIds: ["9d9e119a-9c9a-41b0-b2fe-c40a05c45be7"],
        }),
      }),
    ).rejects.toMatchObject({
      code: "user_profile.role_assignment_invalid",
      kind: "validation",
      details: {
        userProfileId: firstProfile.id,
        roleIds: ["9d9e119a-9c9a-41b0-b2fe-c40a05c45be7"],
      },
    } satisfies Partial<ApplicationError>);
  });

  it("maps update failures to an unexpected ApplicationError", async () => {
    const service = createService();

    userProfileRepository.getByID.mockResolvedValue(firstProfile);
    userProfileRepository.updateByID.mockRejectedValue(new Error("db offline"));

    await expect(
      service.updateByID({
        id: firstProfile.id,
        userProfile: updatePayload({
          displayName: "Alice Updated",
          roleIds: firstProfile.roleIds,
        }),
      }),
    ).rejects.toMatchObject({
      code: "user_profile.update_failed",
      kind: "unexpected",
      details: { userProfileId: firstProfile.id },
    } satisfies Partial<ApplicationError>);
  });
});
