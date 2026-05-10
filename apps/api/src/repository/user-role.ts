import type { Kysely } from "kysely"
import type { Permission } from "@exposurenexus/types/model/rbac"
import type { Database } from "../db/index.js"

export interface UserRoleRepository {
  listPermissionsByUserID(userId: string): Promise<Permission[]>
}

export function createUserRoleRepository(
  database: Kysely<Database>
): UserRoleRepository {
  return {
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
    }
  }
}
