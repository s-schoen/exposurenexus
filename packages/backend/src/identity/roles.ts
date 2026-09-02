import { builtInRoleIds } from "@exposurenexus/contracts/model/rbac";

import { ApplicationError, isApplicationError } from "../application-error.js";
import { isConflictError } from "../database-error.js";

import type {
  CreateRoleCommand,
  DeleteRoleByIDCommand,
  IdentityRoles,
  RoleCreatedOutcome,
  RoleDeletedOutcome,
  RoleUpdatedOutcome,
  UpdateRoleByIDCommand,
} from "./identity.js";
import type { RoleRepository } from "./role-repository.js";
import type { Role } from "@exposurenexus/contracts/model/rbac";
import type { Logger } from "pino";

const protectedRoleIds: Readonly<Record<string, true>> = {
  [builtInRoleIds.viewer]: true,
  [builtInRoleIds.editor]: true,
  [builtInRoleIds.admin]: true,
};

function uniqueValues(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function isProtectedRoleId(id: string): boolean {
  return protectedRoleIds[id] === true;
}

function roleSnapshotsEqual(previous: Role, current: Role): boolean {
  return JSON.stringify(previous) === JSON.stringify(current);
}

interface RoleDependencies {
  roleRepository: RoleRepository;
  logger: Logger;
}

export function createRoles({ roleRepository, logger }: RoleDependencies): IdentityRoles {
  return {
    async listAll(): Promise<Role[]> {
      try {
        return await roleRepository.list();
      } catch (error) {
        logger.error(error, "failed to list roles");
        throw new ApplicationError({
          code: "role.list_failed",
          kind: "unexpected",
          message: "failed to list roles",
          cause: error,
        });
      }
    },

    async getByID(id: string): Promise<Role | null> {
      try {
        const role = await roleRepository.getByID(id);
        if (!role) {
          logger.debug(`role with id ${id} not found`);
        }
        return role;
      } catch (error) {
        logger.error(error, `failed to get role with id ${id}`);
        throw new ApplicationError({
          code: "role.get_failed",
          kind: "unexpected",
          message: "failed to get role",
          cause: error,
          details: { roleId: id },
        });
      }
    },

    async getByNames(names: readonly string[]): Promise<Role[]> {
      try {
        return await roleRepository.getByNames(uniqueValues(names));
      } catch (error) {
        logger.error(error, "failed to get roles by name");
        throw new ApplicationError({
          code: "role.get_by_names_failed",
          kind: "unexpected",
          message: "failed to get roles",
          cause: error,
          details: { roleNames: uniqueValues(names) },
        });
      }
    },

    async resolveRoleIdsFromNames(names: readonly string[]): Promise<string[]> {
      try {
        const uniqueNames = uniqueValues(names);
        const roles = await roleRepository.getByNames(uniqueNames);
        const roleIdByName = new Map(roles.map((role) => [role.name, role.id]));

        return uniqueNames.flatMap((name) => {
          const roleId = roleIdByName.get(name);
          return roleId ? [roleId] : [];
        });
      } catch (error) {
        logger.error(error, "failed to resolve role ids");
        throw new ApplicationError({
          code: "role.resolve_ids_failed",
          kind: "unexpected",
          message: "failed to resolve role ids",
          cause: error,
          details: { roleNames: names },
        });
      }
    },

    async requireRoleNamesFromIds(ids: readonly string[]): Promise<string[]> {
      try {
        const uniqueIds = uniqueValues(ids);
        const roles = await roleRepository.getByIDs(uniqueIds);
        const roleNameById = new Map(roles.map((role) => [role.id, role.name]));
        const missingRoleIds = uniqueIds.filter((id) => !roleNameById.has(id));

        if (missingRoleIds.length > 0) {
          throw new ApplicationError({
            code: "role.unknown_ids",
            kind: "validation",
            message: `unknown role ids: ${missingRoleIds.join(", ")}`,
            details: { roleIds: missingRoleIds },
          });
        }

        return uniqueIds.map((id) => roleNameById.get(id)!);
      } catch (error) {
        if (isApplicationError(error)) {
          throw error;
        }

        logger.error(error, "failed to resolve role names");
        throw new ApplicationError({
          code: "role.resolve_names_failed",
          kind: "unexpected",
          message: "failed to resolve role names",
          cause: error,
          details: { roleIds: ids },
        });
      }
    },

    async create({ role: roleInput, performedBy }: CreateRoleCommand): Promise<RoleCreatedOutcome> {
      try {
        return {
          current: await roleRepository.create(roleInput),
          performedBy,
        };
      } catch (error) {
        if (isConflictError(error)) {
          logger.debug(error, "role create conflict");
          throw new ApplicationError({
            code: "role.create_conflict",
            kind: "conflict",
            message: "role already exists",
            cause: error,
            details: { roleName: roleInput.name },
          });
        }

        logger.error(error, "failed to create role");
        throw new ApplicationError({
          code: "role.create_failed",
          kind: "unexpected",
          message: "failed to create role",
          cause: error,
          details: { roleName: roleInput.name },
        });
      }
    },

    async updateByID({
      id,
      role: roleUpdate,
      performedBy,
    }: UpdateRoleByIDCommand): Promise<RoleUpdatedOutcome | null> {
      if (isProtectedRoleId(id)) {
        throw new ApplicationError({
          code: "role.protected_role",
          kind: "denied",
          message: "built-in roles cannot be modified",
          details: { roleId: id },
        });
      }

      try {
        const previousRole = await roleRepository.getByID(id);
        if (!previousRole) {
          logger.debug(`role with id ${id} not found`);
          return null;
        }

        const updateResult = await roleRepository.updateByID(id, roleUpdate);
        if (!updateResult) {
          logger.debug(`role with id ${id} not found`);
          return null;
        }

        if (updateResult.permissionsChanged) {
          logger.info(
            {
              roleId: id,
              affectedUserCount: updateResult.affectedUserCount,
              revokedSessionCount: updateResult.revokedSessionCount,
            },
            "revoked user sessions after role permission update",
          );
        }

        return {
          previous: previousRole,
          current: updateResult.role,
          changed: !roleSnapshotsEqual(previousRole, updateResult.role),
          performedBy,
        };
      } catch (error) {
        if (isApplicationError(error)) {
          throw error;
        }

        if (isConflictError(error)) {
          logger.debug(error, "role update conflict");
          throw new ApplicationError({
            code: "role.update_conflict",
            kind: "conflict",
            message: "role already exists",
            cause: error,
            details: { roleId: id, roleName: roleUpdate.name },
          });
        }

        logger.error(error, `failed to update role with id ${id}`);
        throw new ApplicationError({
          code: "role.update_failed",
          kind: "unexpected",
          message: "failed to update role",
          cause: error,
          details: { roleId: id },
        });
      }
    },

    async deleteByID({
      id,
      performedBy,
    }: DeleteRoleByIDCommand): Promise<RoleDeletedOutcome | null> {
      if (isProtectedRoleId(id)) {
        throw new ApplicationError({
          code: "role.protected_role",
          kind: "denied",
          message: "built-in roles cannot be modified",
          details: { roleId: id },
        });
      }

      try {
        const existingRole = await roleRepository.getByID(id);
        if (!existingRole) {
          logger.debug(`role with id ${id} not found`);
          return null;
        }

        if (await roleRepository.hasUsersWithRoleID(existingRole.id)) {
          throw new ApplicationError({
            code: "role.assigned_to_users",
            kind: "conflict",
            message: `role ${existingRole.name} is still assigned to users`,
            details: { roleId: existingRole.id, roleName: existingRole.name },
          });
        }

        const deletedRole = await roleRepository.deleteByID(id);
        if (!deletedRole) {
          logger.debug(`role with id ${id} not found during delete`);
          return null;
        }

        return {
          previous: deletedRole,
          performedBy,
        };
      } catch (error) {
        if (isApplicationError(error)) {
          throw error;
        }

        logger.error(error, `failed to delete role with id ${id}`);
        throw new ApplicationError({
          code: "role.delete_failed",
          kind: "unexpected",
          message: "failed to delete role",
          cause: error,
          details: { roleId: id },
        });
      }
    },
  };
}
