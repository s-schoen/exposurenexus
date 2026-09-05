import { ApplicationError } from "../application-error.js";

import type { DatabaseExecutor } from "../database/executor.js";
import type { Database } from "../database/index.js";
import type { IdentityAuthorization, ResourcePermissionVerbAssignment } from "./identity.js";
import type {
  Permission,
  PermissionResource,
  PermissionVerb,
} from "@exposurenexus/contracts/model/rbac";
import type { Kysely } from "kysely";
import type { Logger } from "pino";

interface AuthorizationDependencies {
  database: Kysely<Database>;
  authorizationPersistence: AuthorizationPersistence;
  logger: Logger;
}

interface AuthorizationPersistence {
  listPermissionsByUserID(database: DatabaseExecutor, userId: string): Promise<Permission[]>;
}

function hasRequiredPermissions(
  assignedPermissions: readonly Permission[],
  requiredPermissions: ResourcePermissionVerbAssignment,
): boolean {
  const assignedVerbsByResource = new Map<PermissionResource, Set<PermissionVerb>>();

  for (const permission of assignedPermissions) {
    const assignedVerbs = assignedVerbsByResource.get(permission.resource) ?? new Set();
    assignedVerbs.add(permission.verb);
    assignedVerbsByResource.set(permission.resource, assignedVerbs);
  }

  for (const [resource, verbs] of Object.entries(requiredPermissions)) {
    const assignedVerbs = assignedVerbsByResource.get(resource as PermissionResource);
    for (const verb of verbs ?? []) {
      if (!assignedVerbs?.has(verb)) {
        return false;
      }
    }
  }

  return true;
}

export function createAuthorization({
  database,
  authorizationPersistence,
  logger,
}: AuthorizationDependencies): IdentityAuthorization {
  return {
    async userHasPermission(
      userId: string,
      permissions: ResourcePermissionVerbAssignment,
    ): Promise<boolean> {
      try {
        const assignedPermissions = await authorizationPersistence.listPermissionsByUserID(
          database,
          userId,
        );
        return hasRequiredPermissions(assignedPermissions, permissions);
      } catch (error) {
        logger.error(error, "failed to check user permissions");
        throw new ApplicationError({
          code: "auth.permission_check_failed",
          kind: "unexpected",
          message: "failed to check user permissions",
          cause: error,
          details: { userId },
        });
      }
    },
  };
}
