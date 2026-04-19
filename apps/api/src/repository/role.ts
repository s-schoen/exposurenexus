import type { Kysely } from "kysely"
import type { Database } from "../db/index.js"
import type { Role, UpdateRole } from "@openvlp/types/model/rbac"

type RoleRow = {
  id: string
  name: string
  resource: Database["role_permission_assignment"]["resource"] | null
  verb: Database["role_permission_assignment"]["verb"] | null
}

function toRoles(
  rows: RoleRow[]
): Role[] {
  const rolesById = new Map<string, Role>()

  for (const row of rows) {
    let role = rolesById.get(row.id)

    if (!role) {
      role = {
        id: row.id,
        name: row.name,
        permissions: []
      }
      rolesById.set(row.id, role)
    }

    if (row.resource && row.verb) {
      role.permissions.push({
        resource: row.resource,
        verb: row.verb
      })
    }
  }

  return [...rolesById.values()]
}

function createRoleBaseQuery(database: Kysely<Database>) {
  return database
    .selectFrom("role")
    .leftJoin(
      "role_permission_assignment",
      "role_permission_assignment.role_id",
      "role.id"
    )
    .select([
      "role.id as id",
      "role.name as name",
      "role_permission_assignment.resource as resource",
      "role_permission_assignment.verb as verb"
    ])
}

function dedupePermissions(
  permissions: UpdateRole["permissions"]
): UpdateRole["permissions"] {
  const seenPermissions = new Set<string>()
  const dedupedPermissions: UpdateRole["permissions"] = []

  for (const permission of permissions) {
    const permissionKey = `${permission.resource}:${permission.verb}`
    if (seenPermissions.has(permissionKey)) {
      continue
    }

    seenPermissions.add(permissionKey)
    dedupedPermissions.push(permission)
  }

  return dedupedPermissions
}

export function createRoleRepository(database: Kysely<Database>) {
  return {
    async list(): Promise<Role[]> {
      const rows = await createRoleBaseQuery(database).execute()
      return toRoles(rows)
    },

    async getByID(id: string): Promise<Role | null> {
      const rows = await createRoleBaseQuery(database)
        .where("role.id", "=", id)
        .execute()

      const [role] = toRoles(rows)
      return role ?? null
    },

    async getByIDs(ids: readonly string[]): Promise<Role[]> {
      if (ids.length === 0) {
        return []
      }

      const rows = await createRoleBaseQuery(database)
        .where("role.id", "in", [...ids])
        .execute()

      return toRoles(rows)
    },

    async getByNames(names: readonly string[]): Promise<Role[]> {
      if (names.length === 0) {
        return []
      }

      const rows = await createRoleBaseQuery(database)
        .where("role.name", "in", [...names])
        .execute()

      return toRoles(rows)
    },

    async updateByID(id: string, roleUpdate: UpdateRole): Promise<Role | null> {
      return database.transaction().execute(async (trx) => {
        const updatedRole = await trx
          .updateTable("role")
          .set({ name: roleUpdate.name })
          .where("id", "=", id)
          .returning(["id", "name"])
          .executeTakeFirst()

        if (!updatedRole) {
          return null
        }

        await trx
          .deleteFrom("role_permission_assignment")
          .where("role_id", "=", id)
          .execute()

        const permissions = dedupePermissions(roleUpdate.permissions)

        if (permissions.length > 0) {
          await trx
            .insertInto("role_permission_assignment")
            .values(
              permissions.map((permission) => ({
                role_id: id,
                resource: permission.resource,
                verb: permission.verb
              }))
            )
            .execute()
        }

        const rows = await createRoleBaseQuery(trx)
          .where("role.id", "=", id)
          .execute()

        const [role] = toRoles(rows)
        return role ?? null
      })
    },

    async deleteByID(id: string): Promise<Role | null> {
      return database.transaction().execute(async (trx) => {
        const rows = await createRoleBaseQuery(trx)
          .where("role.id", "=", id)
          .execute()
        const [role] = toRoles(rows)

        if (!role) {
          return null
        }

        await trx.deleteFrom("role").where("id", "=", id).executeTakeFirst()

        return role
      })
    }
  }
}
