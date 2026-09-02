import type { Database } from "../database/index.js";
import type { Permission } from "@exposurenexus/contracts/model/rbac";
import type { Kysely } from "kysely";

export interface AuthorizationRepository {
  listPermissionsByUserID(userId: string): Promise<Permission[]>;
}

export function createAuthorizationRepository(database: Kysely<Database>): AuthorizationRepository {
  return {
    async listPermissionsByUserID(userId: string): Promise<Permission[]> {
      return await database
        .selectFrom("user_role_assignment")
        .innerJoin(
          "role_permission_assignment",
          "role_permission_assignment.roleId",
          "user_role_assignment.roleId",
        )
        .select([
          "role_permission_assignment.resource as resource",
          "role_permission_assignment.verb as verb",
        ])
        .where("user_role_assignment.userId", "=", userId)
        .distinct()
        .execute();
    },
  };
}
