import {
  PermissionResource,
  PermissionVerb,
  builtInRoleIds,
} from "@exposurenexus/contracts/model/rbac";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createTestDatabase, resetTestDatabase } from "../test/db.js";
import { createUserRoleRepository } from "./user-role.js";

import type { Permission } from "@exposurenexus/contracts/model/rbac";

describe("user role repository", () => {
  const testDb = createTestDatabase();

  beforeAll(async () => {
    await testDb.start();
  });

  afterAll(async () => {
    await testDb.dispose();
  });

  beforeEach(async () => {
    await resetTestDatabase(testDb.db);
  });

  async function createUserWithRoles(userId: string, roleIds: string[]) {
    await testDb.db
      .insertInto("user_profile")
      .values({
        id: userId,
        username: `user-${userId.slice(0, 8)}`,
        displayName: "Permission Test User",
        email: `${userId.slice(0, 8)}@example.com`,
        enabled: true,
        passwordHash: "hash",
      })
      .execute();

    if (roleIds.length === 0) {
      return;
    }

    await testDb.db
      .insertInto("user_role_assignment")
      .values(roleIds.map((roleId) => ({ userId, roleId })))
      .execute();
  }

  function countPermission(permissions: Permission[], expected: Permission): number {
    return permissions.filter(
      (permission) =>
        permission.resource === expected.resource && permission.verb === expected.verb,
    ).length;
  }

  it("returns no permissions for users without assigned roles", async () => {
    const repository = createUserRoleRepository(testDb.db);
    const userId = "ca8be35f-b523-47d1-a9d8-743dc272c0cb";

    await createUserWithRoles(userId, []);

    await expect(repository.listPermissionsByUserID(userId)).resolves.toEqual([]);
  });

  it("returns permissions for a single assigned role", async () => {
    const repository = createUserRoleRepository(testDb.db);
    const userId = "61b657d7-92b6-4a82-b937-82e38177707a";

    await createUserWithRoles(userId, [builtInRoleIds.viewer]);

    await expect(repository.listPermissionsByUserID(userId)).resolves.toEqual(
      expect.arrayContaining([
        {
          resource: PermissionResource.Asset,
          verb: PermissionVerb.Read,
        },
        {
          resource: PermissionResource.Finding,
          verb: PermissionVerb.Read,
        },
        {
          resource: PermissionResource.Vulnerability,
          verb: PermissionVerb.Read,
        },
      ]),
    );
  });

  it("returns permissions across multiple assigned roles", async () => {
    const repository = createUserRoleRepository(testDb.db);
    const userId = "0d83ab24-8ff3-4478-95d7-c3dfc4b54431";

    await createUserWithRoles(userId, [builtInRoleIds.viewer, builtInRoleIds.editor]);

    await expect(repository.listPermissionsByUserID(userId)).resolves.toEqual(
      expect.arrayContaining([
        {
          resource: PermissionResource.Asset,
          verb: PermissionVerb.Read,
        },
        {
          resource: PermissionResource.Asset,
          verb: PermissionVerb.Write,
        },
        {
          resource: PermissionResource.Import,
          verb: PermissionVerb.Write,
        },
      ]),
    );
  });

  it("deduplicates permissions granted through multiple roles", async () => {
    const repository = createUserRoleRepository(testDb.db);
    const userId = "b3ed7bd7-8f41-461f-b43b-ff54d996d5f0";

    await createUserWithRoles(userId, [builtInRoleIds.viewer, builtInRoleIds.editor]);

    const permissions = await repository.listPermissionsByUserID(userId);

    expect(
      countPermission(permissions, {
        resource: PermissionResource.Asset,
        verb: PermissionVerb.Read,
      }),
    ).toBe(1);
  });
});
