import {
  PermissionResource,
  PermissionVerb,
  builtInRoleIds,
} from "@exposurenexus/contracts/model/rbac";
import { sql } from "kysely";
import { pino } from "pino";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createTestDatabase, resetTestDatabase } from "../database/test/database.js";
import { createBackendRuntime } from "../runtime.js";
import { createIdentity } from "./identity.js";

describe("identity persistence", () => {
  const testDb = createTestDatabase();
  const logger = pino({ enabled: false });
  const firstUserId = "a7d3ef96-d3b4-48bb-8386-681eb3be7b12";
  const secondUserId = "4fa42fa9-3ff9-48d4-9150-34681f393885";
  const permissionRoleId = "9f5c0b37-7d1d-42ce-9e1a-51906b9e6830";
  const rollbackRoleId = "3fb9f330-637a-4779-a65b-cc9a44d67850";
  const invalidRoleId = "ef2fb643-53e3-4b0c-9b68-253d0dd43f8f";
  const sessionFailureRoleId = "38f9a236-e78d-4776-a373-ee25908be7b1";

  beforeAll(async () => {
    await testDb.start();
  });

  afterAll(async () => {
    await testDb.dispose();
  });

  beforeEach(async () => {
    await resetTestDatabase(testDb.db);
  });

  it("bootstraps an admin only when no user profile exists", async () => {
    const identity = createIdentity(createBackendRuntime({ database: testDb.db, logger }));
    const admin = await identity.users.createInitialAdmin("initial-password");
    expect(admin).toMatchObject({ username: "admin", roleIds: [builtInRoleIds.admin] });
    expect(admin).not.toHaveProperty("passwordHash");
    await expect(identity.users.createInitialAdmin("replacement-password")).resolves.toBeNull();
    expect(await identity.users.listAll()).toHaveLength(1);
  });

  it("does not bootstrap over an existing non-admin profile", async () => {
    await insertUser(firstUserId, "existing", []);
    const identity = createIdentity(createBackendRuntime({ database: testDb.db, logger }));
    await expect(identity.users.createInitialAdmin("initial-password")).resolves.toBeNull();
    expect(await identity.users.listAll()).toEqual([
      expect.objectContaining({ id: firstUserId, username: "existing", roleIds: [] }),
    ]);
  });

  async function insertUser(
    id: string,
    username: string,
    roleIds: readonly string[],
  ): Promise<void> {
    await testDb.db
      .insertInto("user_profile")
      .values({
        id,
        username,
        displayName: username,
        email: `${username}@example.com`,
        enabled: true,
        passwordHash: `hash-${username}`,
      })
      .execute();

    if (roleIds.length > 0) {
      await testDb.db
        .insertInto("user_role_assignment")
        .values(roleIds.map((roleId) => ({ userId: id, roleId })))
        .execute();
    }
  }

  async function insertSession(userId: string, sessionId: string): Promise<void> {
    await testDb.db
      .insertInto("user_session")
      .values({
        sessionId,
        userId,
        sourceIp: null,
        userAgent: null,
        createdAt: new Date("2026-04-23T08:00:00.000Z"),
        expiresAt: new Date("2026-04-23T10:00:00.000Z"),
      })
      .execute();
  }

  function createRuntime() {
    return createBackendRuntime({ database: testDb.db, logger });
  }

  it("resolves empty and mixed role lookups without inventing missing roles", async () => {
    const roles = createIdentity(createRuntime()).roles;
    await expect(roles.getByNames([])).resolves.toEqual([]);
    await expect(roles.requireRoleNamesFromIds([])).resolves.toEqual([]);
    await expect(roles.resolveRoleIdsFromNames(["viewer", "missing", "viewer"])).resolves.toEqual([
      builtInRoleIds.viewer,
    ]);
    await expect(
      roles.updateByID({
        id: invalidRoleId,
        role: { name: "missing", permissions: [] },
        performedBy: firstUserId,
      }),
    ).resolves.toBeNull();
  });

  it("keeps empty roles and treats reordered duplicate permissions as the same permission set", async () => {
    const identity = createIdentity(createRuntime());
    const created = await identity.roles.create({
      role: { name: "empty", permissions: [] },
      performedBy: firstUserId,
    });
    await expect(identity.roles.getByID(created.current.id)).resolves.toEqual(created.current);
    const read = { resource: PermissionResource.Asset, verb: PermissionVerb.Read };
    const write = { resource: PermissionResource.Asset, verb: PermissionVerb.Write };
    await identity.roles.updateByID({
      id: created.current.id,
      role: { name: "reader-writer", permissions: [read, write, read] },
      performedBy: firstUserId,
    });
    await insertUser(firstUserId, "alice", [created.current.id]);
    await insertSession(firstUserId, "retained-session");
    const renamed = await identity.roles.updateByID({
      id: created.current.id,
      role: { name: "renamed", permissions: [write, read] },
      performedBy: firstUserId,
    });
    expect(renamed!.current.permissions).toHaveLength(2);
    expect(renamed!.current.permissions).toEqual(expect.arrayContaining([read, write]));
    await expect(
      testDb.db.selectFrom("user_session").select("sessionId").execute(),
    ).resolves.toEqual([{ sessionId: "retained-session" }]);
    const cleared = await identity.roles.updateByID({
      id: created.current.id,
      role: { name: "renamed", permissions: [] },
      performedBy: firstUserId,
    });
    expect(cleared!.current.permissions).toEqual([]);
    await expect(
      identity.authorization.userHasPermission(firstUserId, {
        [PermissionResource.Asset]: [PermissionVerb.Read],
      }),
    ).resolves.toBe(false);
    await expect(
      testDb.db.selectFrom("user_session").select("sessionId").execute(),
    ).resolves.toEqual([]);
  });

  it("clears all user role assignments and reports an unknown username as missing", async () => {
    await insertUser(firstUserId, "alice", [builtInRoleIds.viewer]);
    const users = createIdentity(createRuntime()).users;
    const result = await users.updateByID({
      id: firstUserId,
      userProfile: { displayName: "Alice", email: "alice@example.com", enabled: true, roleIds: [] },
      performedBy: firstUserId,
    });
    expect(result!.current.roleIds).toEqual([]);
    await expect(users.getByUsername("alice")).resolves.toEqual(result!.current);
    await expect(users.getByUsername("missing")).resolves.toBeNull();
  });

  it("updates user assignments and revokes sessions in one capability operation", async () => {
    await insertUser(firstUserId, "alice", [builtInRoleIds.viewer]);
    await insertUser(secondUserId, "bob", [builtInRoleIds.editor]);
    await insertSession(firstUserId, "alice-session");
    await insertSession(secondUserId, "bob-session");

    const outcome = await createIdentity(createRuntime()).users.updateByID({
      id: firstUserId,
      userProfile: {
        displayName: "Alice Updated",
        email: "alice@example.com",
        enabled: false,
        roleIds: [builtInRoleIds.admin],
      },
      performedBy: firstUserId,
    });

    expect(outcome).toEqual({
      previous: {
        id: firstUserId,
        username: "alice",
        displayName: "alice",
        email: "alice@example.com",
        enabled: true,
        roleIds: [builtInRoleIds.viewer],
      },
      current: {
        id: firstUserId,
        username: "alice",
        displayName: "Alice Updated",
        email: "alice@example.com",
        enabled: false,
        roleIds: [builtInRoleIds.admin],
      },
      performedBy: firstUserId,
    });

    await expect(
      testDb.db
        .selectFrom("user_role_assignment")
        .select(["userId", "roleId"])
        .where("userId", "=", firstUserId)
        .execute(),
    ).resolves.toEqual([{ userId: firstUserId, roleId: builtInRoleIds.admin }]);
    await expect(
      testDb.db.selectFrom("user_session").select("sessionId").execute(),
    ).resolves.toEqual([{ sessionId: "bob-session" }]);
  });

  it("rolls back a user update when a role assignment cannot be persisted", async () => {
    await insertUser(firstUserId, "alice", [builtInRoleIds.viewer]);
    await insertSession(firstUserId, "alice-session");

    await expect(
      createIdentity(createRuntime()).users.updateByID({
        id: firstUserId,
        userProfile: {
          displayName: "Alice Updated",
          email: "alice@example.com",
          enabled: false,
          roleIds: [invalidRoleId],
        },
        performedBy: firstUserId,
      }),
    ).rejects.toMatchObject({
      code: "user_profile.role_assignment_invalid",
      kind: "validation",
    });

    await expect(
      testDb.db
        .selectFrom("user_profile")
        .select(["displayName", "enabled"])
        .where("id", "=", firstUserId)
        .executeTakeFirstOrThrow(),
    ).resolves.toEqual({ displayName: "alice", enabled: true });
    await expect(
      testDb.db
        .selectFrom("user_role_assignment")
        .select(["userId", "roleId"])
        .where("userId", "=", firstUserId)
        .execute(),
    ).resolves.toEqual([{ userId: firstUserId, roleId: builtInRoleIds.viewer }]);
    await expect(
      testDb.db.selectFrom("user_session").select("sessionId").execute(),
    ).resolves.toEqual([{ sessionId: "alice-session" }]);
  });

  it("creates and reads users through the capability with deduplicated assignments", async () => {
    const identity = createIdentity(createRuntime());
    const userProfile = {
      username: "alice",
      displayName: "Alice",
      email: "alice@example.com",
      enabled: true,
      roleIds: [builtInRoleIds.viewer, builtInRoleIds.viewer],
      password: "correct-horse-battery-staple",
    };

    await expect(identity.users.create({ userProfile, performedBy: firstUserId })).resolves.toEqual(
      {
        current: {
          id: expect.any(String),
          username: "alice",
          displayName: "Alice",
          email: "alice@example.com",
          enabled: true,
          roleIds: [builtInRoleIds.viewer],
        },
        performedBy: firstUserId,
      },
    );
    await expect(identity.users.getByUsername("alice")).resolves.toMatchObject({
      username: "alice",
      roleIds: [builtInRoleIds.viewer],
    });
    await expect(identity.users.listAll()).resolves.toHaveLength(1);
    await expect(
      identity.users.create({ userProfile, performedBy: firstUserId }),
    ).rejects.toMatchObject({ code: "user_profile.create_conflict", kind: "conflict" });
  });

  it("rolls back a user update when session revocation fails", async () => {
    await insertUser(firstUserId, "alice", [builtInRoleIds.viewer]);
    await insertSession(firstUserId, "alice-session");

    await sql`
      CREATE FUNCTION fail_identity_user_session_delete() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'identity user session deletion failed';
      END;
      $$
    `.execute(testDb.db);
    await sql`
      CREATE TRIGGER fail_identity_user_session_delete_trigger
      BEFORE DELETE ON user_session
      FOR EACH ROW EXECUTE FUNCTION fail_identity_user_session_delete()
    `.execute(testDb.db);

    try {
      await expect(
        createIdentity(createRuntime()).users.updateByID({
          id: firstUserId,
          userProfile: {
            displayName: "Alice Updated",
            email: "alice@example.com",
            enabled: false,
            roleIds: [builtInRoleIds.admin],
          },
          performedBy: firstUserId,
        }),
      ).rejects.toMatchObject({ code: "user_profile.update_failed", kind: "unexpected" });
    } finally {
      await sql`
        DROP TRIGGER fail_identity_user_session_delete_trigger ON user_session
      `.execute(testDb.db);
      await sql`DROP FUNCTION fail_identity_user_session_delete`.execute(testDb.db);
    }

    await expect(
      testDb.db
        .selectFrom("user_profile")
        .select(["displayName", "enabled"])
        .where("id", "=", firstUserId)
        .executeTakeFirstOrThrow(),
    ).resolves.toEqual({ displayName: "alice", enabled: true });
    await expect(
      testDb.db
        .selectFrom("user_role_assignment")
        .select(["userId", "roleId"])
        .where("userId", "=", firstUserId)
        .execute(),
    ).resolves.toEqual([{ userId: firstUserId, roleId: builtInRoleIds.viewer }]);
    await expect(
      testDb.db.selectFrom("user_session").select("sessionId").execute(),
    ).resolves.toEqual([{ sessionId: "alice-session" }]);
  });

  it("updates role permissions and revokes affected user sessions together", async () => {
    await testDb.db.insertInto("role").values({ id: permissionRoleId, name: "analyst" }).execute();
    await testDb.db
      .insertInto("role_permission_assignment")
      .values({
        roleId: permissionRoleId,
        resource: PermissionResource.Asset,
        verb: PermissionVerb.Read,
      })
      .execute();
    await insertUser(firstUserId, "alice", [permissionRoleId]);
    await insertUser(secondUserId, "bob", []);
    await insertSession(firstUserId, "alice-session");
    await insertSession(secondUserId, "bob-session");

    const outcome = await createIdentity(createRuntime()).roles.updateByID({
      id: permissionRoleId,
      role: {
        name: "analyst",
        permissions: [
          { resource: PermissionResource.Asset, verb: PermissionVerb.Read },
          { resource: PermissionResource.Asset, verb: PermissionVerb.Write },
        ],
      },
      performedBy: firstUserId,
    });

    expect(outcome).toEqual({
      previous: {
        id: permissionRoleId,
        name: "analyst",
        permissions: [{ resource: PermissionResource.Asset, verb: PermissionVerb.Read }],
      },
      current: {
        id: permissionRoleId,
        name: "analyst",
        permissions: [
          { resource: PermissionResource.Asset, verb: PermissionVerb.Read },
          { resource: PermissionResource.Asset, verb: PermissionVerb.Write },
        ],
      },
      changed: true,
      performedBy: firstUserId,
    });
    await expect(
      testDb.db.selectFrom("user_session").select("sessionId").execute(),
    ).resolves.toEqual([{ sessionId: "bob-session" }]);
  });

  it("creates, authorizes, and deletes roles through the capability", async () => {
    const identity = createIdentity(createRuntime());
    const created = await identity.roles.create({
      role: {
        name: "capability-analyst",
        permissions: [{ resource: PermissionResource.Asset, verb: PermissionVerb.Read }],
      },
      performedBy: firstUserId,
    });
    await insertUser(firstUserId, "alice", [created.current.id]);

    await expect(identity.roles.getByID(created.current.id)).resolves.toEqual(created.current);
    await expect(
      identity.authorization.userHasPermission(firstUserId, {
        [PermissionResource.Asset]: [PermissionVerb.Read],
      }),
    ).resolves.toBe(true);
    await expect(
      identity.roles.deleteByID({ id: created.current.id, performedBy: firstUserId }),
    ).rejects.toMatchObject({ code: "role.assigned_to_users", kind: "conflict" });

    await testDb.db.deleteFrom("user_role_assignment").where("userId", "=", firstUserId).execute();
    await expect(
      identity.roles.deleteByID({ id: created.current.id, performedBy: firstUserId }),
    ).resolves.toEqual({ previous: created.current, performedBy: firstUserId });
    await expect(identity.roles.getByID(created.current.id)).resolves.toBeNull();
  });

  it("rolls back role and session changes when permission persistence fails", async () => {
    await testDb.db
      .insertInto("role")
      .values({ id: rollbackRoleId, name: "rollback-analyst" })
      .execute();
    await testDb.db
      .insertInto("role_permission_assignment")
      .values({
        roleId: rollbackRoleId,
        resource: PermissionResource.Asset,
        verb: PermissionVerb.Read,
      })
      .execute();
    await insertUser(firstUserId, "alice", [rollbackRoleId]);
    await insertSession(firstUserId, "alice-session");

    await expect(
      createIdentity(createRuntime()).roles.updateByID({
        id: rollbackRoleId,
        role: {
          name: "renamed-rollback-analyst",
          permissions: [
            {
              resource: "not-a-permission",
              verb: PermissionVerb.Read,
            },
          ],
        } as never,
        performedBy: firstUserId,
      }),
    ).rejects.toMatchObject({ code: "role.update_failed", kind: "unexpected" });

    await expect(
      testDb.db
        .selectFrom("role")
        .select(["name"])
        .where("id", "=", rollbackRoleId)
        .executeTakeFirstOrThrow(),
    ).resolves.toEqual({ name: "rollback-analyst" });
    await expect(
      testDb.db
        .selectFrom("role_permission_assignment")
        .select(["resource", "verb"])
        .where("roleId", "=", rollbackRoleId)
        .execute(),
    ).resolves.toEqual([{ resource: PermissionResource.Asset, verb: PermissionVerb.Read }]);
    await expect(
      testDb.db.selectFrom("user_session").select("sessionId").execute(),
    ).resolves.toEqual([{ sessionId: "alice-session" }]);
  });

  it("rolls back role and permission changes when session revocation fails", async () => {
    await testDb.db
      .insertInto("role")
      .values({ id: sessionFailureRoleId, name: "session-failure-analyst" })
      .execute();
    await testDb.db
      .insertInto("role_permission_assignment")
      .values({
        roleId: sessionFailureRoleId,
        resource: PermissionResource.Asset,
        verb: PermissionVerb.Read,
      })
      .execute();
    await insertUser(firstUserId, "alice", [sessionFailureRoleId]);
    await insertSession(firstUserId, "alice-session");

    await sql`
      CREATE FUNCTION fail_identity_session_delete() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'identity session deletion failed';
      END;
      $$
    `.execute(testDb.db);
    await sql`
      CREATE TRIGGER fail_identity_session_delete_trigger
      BEFORE DELETE ON user_session
      FOR EACH ROW EXECUTE FUNCTION fail_identity_session_delete()
    `.execute(testDb.db);

    try {
      await expect(
        createIdentity(createRuntime()).roles.updateByID({
          id: sessionFailureRoleId,
          role: {
            name: "renamed-session-failure-analyst",
            permissions: [
              { resource: PermissionResource.Asset, verb: PermissionVerb.Read },
              { resource: PermissionResource.Asset, verb: PermissionVerb.Write },
            ],
          },
          performedBy: firstUserId,
        }),
      ).rejects.toMatchObject({ code: "role.update_failed", kind: "unexpected" });
    } finally {
      await sql`DROP TRIGGER fail_identity_session_delete_trigger ON user_session`.execute(
        testDb.db,
      );
      await sql`DROP FUNCTION fail_identity_session_delete`.execute(testDb.db);
    }

    await expect(
      testDb.db
        .selectFrom("role")
        .select(["name"])
        .where("id", "=", sessionFailureRoleId)
        .executeTakeFirstOrThrow(),
    ).resolves.toEqual({ name: "session-failure-analyst" });
    await expect(
      testDb.db
        .selectFrom("role_permission_assignment")
        .select(["resource", "verb"])
        .where("roleId", "=", sessionFailureRoleId)
        .execute(),
    ).resolves.toEqual([{ resource: PermissionResource.Asset, verb: PermissionVerb.Read }]);
    await expect(
      testDb.db.selectFrom("user_session").select("sessionId").execute(),
    ).resolves.toEqual([{ sessionId: "alice-session" }]);
  });
});
