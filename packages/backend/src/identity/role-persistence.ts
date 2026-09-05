import type { DatabaseExecutor } from "../database/executor.js";
import type { CreateRole, Permission, Role, UpdateRole } from "@exposurenexus/contracts/model/rbac";

type RoleRow = {
  id: string;
  name: string;
  resource: Permission["resource"] | null;
  verb: Permission["verb"] | null;
};

export interface RoleUpdatePersistenceResult {
  previous: Role;
  role: Role;
  permissionsChanged: boolean;
  affectedUserIds: string[];
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

function permissionKey(permission: Permission): string {
  return `${permission.resource}:${permission.verb}`;
}

function samePermissionSet(left: readonly Permission[], right: readonly Permission[]): boolean {
  const leftKeys = new Set(left.map(permissionKey));
  const rightKeys = new Set(right.map(permissionKey));

  if (leftKeys.size !== rightKeys.size) {
    return false;
  }

  return [...leftKeys].every((key) => rightKeys.has(key));
}

function dedupePermissions(permissions: readonly Permission[]): Permission[] {
  const seenPermissions = new Set<string>();
  const dedupedPermissions: Permission[] = [];

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

export async function listRoles(database: DatabaseExecutor): Promise<Role[]> {
  const rows = await createRoleBaseQuery(database).execute();
  return toRoles(rows);
}

export async function getRoleByID(database: DatabaseExecutor, id: string): Promise<Role | null> {
  const rows = await createRoleBaseQuery(database).where("role.id", "=", id).execute();

  const [role] = toRoles(rows);
  return role ?? null;
}

export async function getRolesByIDs(
  database: DatabaseExecutor,
  ids: readonly string[],
): Promise<Role[]> {
  if (ids.length === 0) {
    return [];
  }

  const rows = await createRoleBaseQuery(database)
    .where("role.id", "in", [...ids])
    .execute();

  return toRoles(rows);
}

export async function getRolesByNames(
  database: DatabaseExecutor,
  names: readonly string[],
): Promise<Role[]> {
  if (names.length === 0) {
    return [];
  }

  const rows = await createRoleBaseQuery(database)
    .where("role.name", "in", [...names])
    .execute();

  return toRoles(rows);
}

export async function insertRole(database: DatabaseExecutor, role: CreateRole): Promise<Role> {
  const insertedRole = await database
    .insertInto("role")
    .values({ name: role.name })
    .returning(["id"])
    .executeTakeFirstOrThrow();
  const permissions = dedupePermissions(role.permissions);

  if (permissions.length > 0) {
    await database
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

  const rows = await createRoleBaseQuery(database).where("role.id", "=", insertedRole.id).execute();

  const [createdRole] = toRoles(rows);
  return createdRole!;
}

export async function updateRole(
  database: DatabaseExecutor,
  {
    id,
    roleUpdate,
  }: {
    id: string;
    roleUpdate: UpdateRole;
  },
): Promise<RoleUpdatePersistenceResult | null> {
  const previous = await getRoleByID(database, id);
  if (!previous) {
    return null;
  }

  const existingPermissions = await database
    .selectFrom("role_permission_assignment")
    .select(["resource", "verb"])
    .where("roleId", "=", id)
    .execute();
  const permissions = dedupePermissions(roleUpdate.permissions);
  const permissionsChanged = !samePermissionSet(existingPermissions, permissions);
  const affectedUserIds = permissionsChanged ? await listUserIdsByRoleID(database, id) : [];

  const updatedRole = await database
    .updateTable("role")
    .set({ name: roleUpdate.name })
    .where("id", "=", id)
    .returning(["id", "name"])
    .executeTakeFirst();

  if (!updatedRole) {
    return null;
  }

  await database.deleteFrom("role_permission_assignment").where("roleId", "=", id).execute();

  if (permissions.length > 0) {
    await database
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

  const rows = await createRoleBaseQuery(database).where("role.id", "=", id).execute();
  const [role] = toRoles(rows);
  if (!role) {
    return null;
  }

  return {
    previous,
    role,
    permissionsChanged,
    affectedUserIds,
  };
}

export async function hasUsersWithRoleID(
  database: DatabaseExecutor,
  roleId: string,
): Promise<boolean> {
  const result = await database
    .selectFrom("user_role_assignment")
    .select(({ fn }) => fn.countAll<number>().as("count"))
    .where("roleId", "=", roleId)
    .executeTakeFirstOrThrow();

  return result.count > 0;
}

export async function deleteRole(
  database: DatabaseExecutor,
  {
    id,
    previous,
  }: {
    id: string;
    previous: Role;
  },
): Promise<Role | null> {
  await database.deleteFrom("role").where("id", "=", id).executeTakeFirst();

  return previous;
}
