import type { Kysely } from "kysely"
import type { Permission, Role, UpdateRole } from "@openvlp/types/model/rbac"
import type { Database } from "../db/index.js"

type RoleRow = {
  id: string
  name: string
  resource: Database["role_permission_assignment"]["resource"] | null
  verb: Database["role_permission_assignment"]["verb"] | null
}

function toRoles(rows: RoleRow[]): Role[] {
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

export function createUserRoleRepository(database: Kysely<Database>) {
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

    async listPermissionsByUserID(userId: string): Promise<Permission[]> {
      return await database
        .selectFrom("user_role_assignment")
        .innerJoin(
          "role_permission_assignment",
          "role_permission_assignment.role_id",
          "user_role_assignment.roleId"
        )
        .select([
          "role_permission_assignment.resource as resource",
          "role_permission_assignment.verb as verb"
        ])
        .where("user_role_assignment.userId", "=", userId)
        .distinct()
        .execute()
    },

    async create(role: UpdateRole): Promise<Role> {
      return database.transaction().execute(async (trx) => {
        // Create the role row first so permission assignments can reference it.
        const insertedRole = await trx
          .insertInto("role")
          .values({ name: role.name })
          .returning(["id"])
          .executeTakeFirstOrThrow()

        // Persist the requested permission assignments as-is.
        if (role.permissions.length > 0) {
          await trx
            .insertInto("role_permission_assignment")
            .values(
              role.permissions.map((permission) => ({
                role_id: insertedRole.id,
                resource: permission.resource,
                verb: permission.verb
              }))
            )
            .execute()
        }

        // Re-read the role through the shared query so the return shape matches list/get.
        const rows = await createRoleBaseQuery(trx)
          .where("role.id", "=", insertedRole.id)
          .execute()

        const [createdRole] = toRoles(rows)
        return createdRole!
      })
    },

    async updateByID(id: string, roleUpdate: UpdateRole): Promise<Role | null> {
      return database.transaction().execute(async (trx) => {
        // Load the current role so we can detect missing ids before updating.
        const existingRole = await trx
          .selectFrom("role")
          .select(["id", "name"])
          .where("id", "=", id)
          .executeTakeFirst()

        if (!existingRole) {
          return null
        }

        // Update the role name itself before refreshing permission assignments.
        const updatedRole = await trx
          .updateTable("role")
          .set({ name: roleUpdate.name })
          .where("id", "=", id)
          .executeTakeFirst()

        if (!updatedRole) {
          return null
        }

        // Delete all previous permission assignments, we'll add them all at once later
        await trx
          .deleteFrom("role_permission_assignment")
          .where("role_id", "=", id)
          .execute()

        // Insert the new permission assignments exactly as provided.
        if (roleUpdate.permissions.length > 0) {
          await trx
            .insertInto("role_permission_assignment")
            .values(
              roleUpdate.permissions.map((permission) => ({
                role_id: id,
                resource: permission.resource,
                verb: permission.verb
              }))
            )
            .execute()
        }

        // Re-read the updated role through the shared query for a consistent response
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
