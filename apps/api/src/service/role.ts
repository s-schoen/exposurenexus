import type { Logger } from "pino"
import {
  builtInRoleIds,
  type CreateRole,
  type Role,
  type UpdateRole
} from "@exposurenexus/types/model/rbac"
import { ApplicationError, isApplicationError } from "./application-error.js"
import { isConflictError } from "./errors.js"
import {
  createDomainEventEmitter,
  type DomainEventContext,
  type DomainEventEmitter,
  type RoleEventPayloads
} from "../lib/eventbus/events/index.js"
import type { RoleRepository } from "../repository/role.js"

const protectedRoleIds = new Set<string>(Object.values(builtInRoleIds))

function uniqueValues(values: readonly string[]): string[] {
  return [...new Set(values)]
}

function isProtectedRoleId(id: string): boolean {
  return protectedRoleIds.has(id)
}

function roleSnapshotsEqual(previous: Role, current: Role): boolean {
  return JSON.stringify(previous) === JSON.stringify(current)
}

interface RoleServiceDependencies {
  roleRepository: RoleRepository
  domainEventEmitter: DomainEventEmitter
  logger: Logger
}

export interface UpdateRoleOptions {
  id: string
  role: UpdateRole
  eventContext?: DomainEventContext
}

export interface RoleService {
  listAll(): Promise<Role[]>
  getByID(id: string): Promise<Role | null>
  getByNames(names: readonly string[]): Promise<Role[]>
  resolveRoleIdsFromNames(names: readonly string[]): Promise<string[]>
  requireRoleNamesFromIds(ids: readonly string[]): Promise<string[]>
  create(role: CreateRole, eventContext?: DomainEventContext): Promise<Role>
  updateByID(opts: UpdateRoleOptions): Promise<Role | null>
  deleteByID(
    id: string,
    eventContext?: DomainEventContext
  ): Promise<Role | null>
}

export function createRoleService({
  roleRepository,
  domainEventEmitter,
  logger
}: RoleServiceDependencies): RoleService {
  type RoleEventSubject = keyof RoleEventPayloads & string
  const emitRoleEvent = createDomainEventEmitter<RoleEventSubject>(
    domainEventEmitter,
    "role"
  )

  return {
    async listAll(): Promise<Role[]> {
      try {
        return await roleRepository.list()
      } catch (error) {
        logger.error(error, "failed to list roles")
        throw new ApplicationError({
          code: "role.list_failed",
          kind: "unexpected",
          message: "failed to list roles",
          cause: error
        })
      }
    },

    async getByID(id: string): Promise<Role | null> {
      try {
        const role = await roleRepository.getByID(id)
        if (!role) {
          logger.debug(`role with id ${id} not found`)
        }
        return role
      } catch (error) {
        logger.error(error, `failed to get role with id ${id}`)
        throw new ApplicationError({
          code: "role.get_failed",
          kind: "unexpected",
          message: "failed to get role",
          cause: error,
          details: { roleId: id }
        })
      }
    },

    async getByNames(names: readonly string[]): Promise<Role[]> {
      try {
        return await roleRepository.getByNames(uniqueValues(names))
      } catch (error) {
        logger.error(error, "failed to get roles by name")
        throw new ApplicationError({
          code: "role.get_by_names_failed",
          kind: "unexpected",
          message: "failed to get roles",
          cause: error,
          details: { roleNames: uniqueValues(names) }
        })
      }
    },

    async resolveRoleIdsFromNames(names: readonly string[]): Promise<string[]> {
      try {
        const uniqueNames = uniqueValues(names)
        const roles = await roleRepository.getByNames(uniqueNames)
        const roleIdByName = new Map(roles.map((role) => [role.name, role.id]))

        return uniqueNames.flatMap((name) => {
          const roleId = roleIdByName.get(name)
          return roleId ? [roleId] : []
        })
      } catch (error) {
        logger.error(error, "failed to resolve role ids")
        throw new ApplicationError({
          code: "role.resolve_ids_failed",
          kind: "unexpected",
          message: "failed to resolve role ids",
          cause: error,
          details: { roleNames: names }
        })
      }
    },

    async requireRoleNamesFromIds(ids: readonly string[]): Promise<string[]> {
      try {
        const uniqueIds = uniqueValues(ids)
        const roles = await roleRepository.getByIDs(uniqueIds)
        const roleNameById = new Map(roles.map((role) => [role.id, role.name]))
        const missingRoleIds = uniqueIds.filter((id) => !roleNameById.has(id))

        if (missingRoleIds.length > 0) {
          throw new ApplicationError({
            code: "role.unknown_ids",
            kind: "validation",
            message: `unknown role ids: ${missingRoleIds.join(", ")}`,
            details: { roleIds: missingRoleIds }
          })
        }

        return uniqueIds.map((id) => roleNameById.get(id)!)
      } catch (error) {
        if (isApplicationError(error)) {
          throw error
        }

        logger.error(error, "failed to resolve role names")
        throw new ApplicationError({
          code: "role.resolve_names_failed",
          kind: "unexpected",
          message: "failed to resolve role names",
          cause: error,
          details: { roleIds: ids }
        })
      }
    },

    async create(
      roleInput: CreateRole,
      eventContext?: DomainEventContext
    ): Promise<Role> {
      try {
        const role = await roleRepository.create(roleInput)

        emitRoleEvent("role.created", { role }, eventContext)
        return role
      } catch (error) {
        if (isConflictError(error)) {
          logger.debug(error, "role create conflict")
          throw new ApplicationError({
            code: "role.create_conflict",
            kind: "conflict",
            message: "role already exists",
            cause: error,
            details: { roleName: roleInput.name }
          })
        }

        logger.error(error, "failed to create role")
        throw new ApplicationError({
          code: "role.create_failed",
          kind: "unexpected",
          message: "failed to create role",
          cause: error,
          details: { roleName: roleInput.name }
        })
      }
    },

    async updateByID(opts: UpdateRoleOptions): Promise<Role | null> {
      const { id, role: roleUpdate, eventContext } = opts

      if (isProtectedRoleId(id)) {
        throw new ApplicationError({
          code: "role.protected_role",
          kind: "denied",
          message: "built-in roles cannot be modified",
          details: { roleId: id }
        })
      }

      try {
        const previousRole = await roleRepository.getByID(id)
        if (!previousRole) {
          logger.debug(`role with id ${id} not found`)
          return null
        }

        const updateResult = await roleRepository.updateByID(id, roleUpdate)
        if (!updateResult) {
          logger.debug(`role with id ${id} not found`)
          return null
        }

        if (updateResult.permissionsChanged) {
          logger.info(
            {
              roleId: id,
              affectedUserCount: updateResult.affectedUserCount,
              revokedSessionCount: updateResult.revokedSessionCount
            },
            "revoked user sessions after role permission update"
          )
        }

        if (!roleSnapshotsEqual(previousRole, updateResult.role)) {
          emitRoleEvent(
            "role.updated",
            {
              previous: previousRole,
              current: updateResult.role
            },
            eventContext
          )
        }

        return updateResult.role
      } catch (error) {
        if (isApplicationError(error)) {
          throw error
        }

        if (isConflictError(error)) {
          logger.debug(error, "role update conflict")
          throw new ApplicationError({
            code: "role.update_conflict",
            kind: "conflict",
            message: "role already exists",
            cause: error,
            details: { roleId: id, roleName: roleUpdate.name }
          })
        }

        logger.error(error, `failed to update role with id ${id}`)
        throw new ApplicationError({
          code: "role.update_failed",
          kind: "unexpected",
          message: "failed to update role",
          cause: error,
          details: { roleId: id }
        })
      }
    },

    async deleteByID(
      id: string,
      eventContext?: DomainEventContext
    ): Promise<Role | null> {
      if (isProtectedRoleId(id)) {
        throw new ApplicationError({
          code: "role.protected_role",
          kind: "denied",
          message: "built-in roles cannot be modified",
          details: { roleId: id }
        })
      }

      try {
        const existingRole = await roleRepository.getByID(id)
        if (!existingRole) {
          logger.debug(`role with id ${id} not found`)
          return null
        }

        if (await roleRepository.hasUsersWithRoleID(existingRole.id)) {
          throw new ApplicationError({
            code: "role.assigned_to_users",
            kind: "conflict",
            message: `role ${existingRole.name} is still assigned to users`,
            details: { roleId: existingRole.id, roleName: existingRole.name }
          })
        }

        const deletedRole = await roleRepository.deleteByID(id)
        if (!deletedRole) {
          logger.debug(`role with id ${id} not found during delete`)
          return null
        }

        emitRoleEvent("role.deleted", { role: deletedRole }, eventContext)
        return deletedRole
      } catch (error) {
        if (isApplicationError(error)) {
          throw error
        }

        logger.error(error, `failed to delete role with id ${id}`)
        throw new ApplicationError({
          code: "role.delete_failed",
          kind: "unexpected",
          message: "failed to delete role",
          cause: error,
          details: { roleId: id }
        })
      }
    }
  }
}
