import type { Database } from "@exposurenexus/backend/database";
import type { CreateRole, Role, UpdateRole } from "@exposurenexus/contracts/model/rbac";
import type { Kysely, Transaction } from "kysely";

type DatabaseExecutor = Kysely<Database> | Transaction<Database>;

type RoleRow = {
  id: string;
  name: string;
  resource: Database["role_permission_assignment"]["resource"] | null;
  verb: Database["role_permission_assignment"]["verb"] | null;
};

export interface RoleUpdateResult {
  role: Role;
  permissionsChanged: boolean;
  affectedUserCount: number;
  revokedSessionCount: number;
}

export interface RoleRepository {
  list(): Promise<Role[]>;
  getByID(id: string): Promise<Role | null>;
  getByIDs(ids: readonly string[]): Promise<Role[]>;
  getByNames(names: readonly string[]): Promise<Role[]>;
  create(role: CreateRole): Promise<Role>;
  updateByID(id: string, roleUpdate: UpdateRole): Promise<RoleUpdateResult | null>;
  deleteByID(id: string): Promise<Role | null>;
  hasUsersWithRoleID(roleId: string): Promise<boolean>;
}

function toRoles(rows: RoleRow[]): Role[] {
  const rolesById = new Map<string, Role>();

  for (const row of rows) {
    let role = rolesById.get(row.id);

    if (!role) {
      role = {
        id: row.id,
        name: row.name,
        permissions: [],
      };
      rolesById.set(row.id, role);
    }

    if (row.resource && row.verb) {
      role.permissions.push({
        resource: row.resource,
        verb: row.verb,
      });
    }
  }

  return [...rolesById.values()];
}

function createRoleBaseQuery(database: DatabaseExecutor) {
  return database
    .selectFrom("role")
    .leftJoin("role_permission_assignment", "role_permission_assignment.roleId", "role.id")
    .select([
      "role.id as id",
      "role.name as name",
      "role_permission_assignment.resource as resource",
      "role_permission_assignment.verb as verb",
    ]);
}

function permissionKey(permission: UpdateRole["permissions"][number]): string {
  return `${permission.resource}:${permission.verb}`;
}

function samePermissionSet(
  left: UpdateRole["permissions"],
  right: UpdateRole["permissions"],
): boolean {
  const leftKeys = new Set(left.map(permissionKey));
  const rightKeys = new Set(right.map(permissionKey));

  if (leftKeys.size !== rightKeys.size) {
    return false;
  }

  return [...leftKeys].every((key) => rightKeys.has(key));
}

function dedupePermissions(permissions: UpdateRole["permissions"]): UpdateRole["permissions"] {
  const seenPermissions = new Set<string>();
  const dedupedPermissions: UpdateRole["permissions"] = [];

  for (const permission of permissions) {
    const key = permissionKey(permission);
    if (seenPermissions.has(key)) {
      continue;
    }

    seenPermissions.add(key);
    dedupedPermissions.push(permission);
  }

  return dedupedPermissions;
}

async function listUserIdsByRoleID(database: DatabaseExecutor, roleId: string): Promise<string[]> {
  const rows = await database
    .selectFrom("user_role_assignment")
    .select("userId")
    .where("roleId", "=", roleId)
    .execute();

  return rows.map((row) => row.userId);
}

async function deleteSessionsByUserIDs(
  database: DatabaseExecutor,
  userIds: readonly string[],
): Promise<number> {
  if (userIds.length === 0) {
    return 0;
  }

  const deletedSessions = await database
    .deleteFrom("user_session")
    .where("userId", "in", [...userIds])
    .returning("id")
    .execute();

  return deletedSessions.length;
}

export function createRoleRepository(database: Kysely<Database>): RoleRepository {
  return {
    async list(): Promise<Role[]> {
      const rows = await createRoleBaseQuery(database).execute();
      return toRoles(rows);
    },

    async getByID(id: string): Promise<Role | null> {
      const rows = await createRoleBaseQuery(database).where("role.id", "=", id).execute();

      const [role] = toRoles(rows);
      return role ?? null;
    },

    async getByIDs(ids: readonly string[]): Promise<Role[]> {
      if (ids.length === 0) {
        return [];
      }

      const rows = await createRoleBaseQuery(database)
        .where("role.id", "in", [...ids])
        .execute();

      return toRoles(rows);
    },

    async getByNames(names: readonly string[]): Promise<Role[]> {
      if (names.length === 0) {
        return [];
      }

      const rows = await createRoleBaseQuery(database)
        .where("role.name", "in", [...names])
        .execute();

      return toRoles(rows);
    },

    async create(role: CreateRole): Promise<Role> {
      return database.transaction().execute(async (trx) => {
        const insertedRole = await trx
          .insertInto("role")
          .values({ name: role.name })
          .returning(["id"])
          .executeTakeFirstOrThrow();
        const permissions = dedupePermissions(role.permissions);

        if (permissions.length > 0) {
          await trx
            .insertInto("role_permission_assignment")
            .values(
              permissions.map((permission) => ({
                roleId: insertedRole.id,
                resource: permission.resource,
                verb: permission.verb,
              })),
            )
            .execute();
        }

        const rows = await createRoleBaseQuery(trx)
          .where("role.id", "=", insertedRole.id)
          .execute();

        const [createdRole] = toRoles(rows);
        return createdRole!;
      });
    },

    async updateByID(id: string, roleUpdate: UpdateRole): Promise<RoleUpdateResult | null> {
      return database.transaction().execute(async (trx) => {
        const existingRole = await trx
          .selectFrom("role")
          .select(["id", "name"])
          .where("id", "=", id)
          .executeTakeFirst();

        if (!existingRole) {
          return null;
        }

        const existingPermissions = await trx
          .selectFrom("role_permission_assignment")
          .select(["resource", "verb"])
          .where("roleId", "=", id)
          .execute();
        const permissions = dedupePermissions(roleUpdate.permissions);
        const permissionsChanged = !samePermissionSet(existingPermissions, permissions);
        const affectedUserIds = permissionsChanged ? await listUserIdsByRoleID(trx, id) : [];

        const updatedRole = await trx
          .updateTable("role")
          .set({ name: roleUpdate.name })
          .where("id", "=", id)
          .returning(["id", "name"])
          .executeTakeFirst();

        if (!updatedRole) {
          return null;
        }

        await trx.deleteFrom("role_permission_assignment").where("roleId", "=", id).execute();

        if (permissions.length > 0) {
          await trx
            .insertInto("role_permission_assignment")
            .values(
              permissions.map((permission) => ({
                roleId: id,
                resource: permission.resource,
                verb: permission.verb,
              })),
            )
            .execute();
        }

        const rows = await createRoleBaseQuery(trx).where("role.id", "=", id).execute();

        const [role] = toRoles(rows);
        if (!role) {
          return null;
        }

        const revokedSessionCount = permissionsChanged
          ? await deleteSessionsByUserIDs(trx, affectedUserIds)
          : 0;

        return {
          role,
          permissionsChanged,
          affectedUserCount: affectedUserIds.length,
          revokedSessionCount,
        };
      });
    },

    async deleteByID(id: string): Promise<Role | null> {
      return database.transaction().execute(async (trx) => {
        const rows = await createRoleBaseQuery(trx).where("role.id", "=", id).execute();
        const [role] = toRoles(rows);

        if (!role) {
          return null;
        }

        await trx.deleteFrom("role").where("id", "=", id).executeTakeFirst();

        return role;
      });
    },

    async hasUsersWithRoleID(roleId: string): Promise<boolean> {
      const result = await database
        .selectFrom("user_role_assignment")
        .select(({ fn }) => fn.countAll<number>().as("count"))
        .where("roleId", "=", roleId)
        .executeTakeFirstOrThrow();

      return result.count > 0;
    },
  };
}
