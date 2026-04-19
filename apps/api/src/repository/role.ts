import type { Kysely } from "kysely"
import type { Database } from "../db/index.js"
import type { Role } from "@openvlp/types/model/rbac"

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
    }
  }
}
