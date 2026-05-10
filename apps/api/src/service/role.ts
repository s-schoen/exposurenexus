import { HTTPException } from "hono/http-exception"
import type { Logger } from "pino"
import {
  builtInRoleIds,
  type CreateRole,
  type Role,
  type UpdateRole
} from "@exposurenexus/types/model/rbac"
import { conflict, isConflictError } from "./errors.js"
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
        throw new HTTPException(500, {
          message: "failed to list roles"
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
        throw new HTTPException(500, {
          message: "failed to get role"
        })
      }
    },

    async getByNames(names: readonly string[]): Promise<Role[]> {
      try {
        return await roleRepository.getByNames(uniqueValues(names))
      } catch (error) {
        logger.error(error, "failed to get roles by name")
        throw new HTTPException(500, {
          message: "failed to get roles"
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
        throw new HTTPException(500, {
          message: "failed to resolve role ids"
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
          throw new HTTPException(400, {
            message: `unknown role ids: ${missingRoleIds.join(", ")}`
          })
        }

        return uniqueIds.map((id) => roleNameById.get(id)!)
      } catch (error) {
        if (error instanceof HTTPException) {
          throw error
        }

        logger.error(error, "failed to resolve role names")
        throw new HTTPException(500, {
          message: "failed to resolve role names"
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
          throw conflict("role already exists")
        }

        logger.error(error, "failed to create role")
        throw new HTTPException(500, {
          message: "failed to create role"
        })
      }
    },

    async updateByID(opts: UpdateRoleOptions): Promise<Role | null> {
      const { id, role: roleUpdate, eventContext } = opts

      if (isProtectedRoleId(id)) {
        throw new HTTPException(403, {
          message: "built-in roles cannot be modified"
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
        if (error instanceof HTTPException) {
          throw error
        }

        if (isConflictError(error)) {
          logger.debug(error, "role update conflict")
          throw conflict("role already exists")
        }

        logger.error(error, `failed to update role with id ${id}`)
        throw new HTTPException(500, {
          message: "failed to update role"
        })
      }
    },

    async deleteByID(
      id: string,
      eventContext?: DomainEventContext
    ): Promise<Role | null> {
      if (isProtectedRoleId(id)) {
        throw new HTTPException(403, {
          message: "built-in roles cannot be modified"
        })
      }

      try {
        const existingRole = await roleRepository.getByID(id)
        if (!existingRole) {
          logger.debug(`role with id ${id} not found`)
          return null
        }

        if (await roleRepository.hasUsersWithRoleID(existingRole.id)) {
          throw new HTTPException(409, {
            message: `role ${existingRole.name} is still assigned to users`
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
        if (error instanceof HTTPException) {
          throw error
        }

        logger.error(error, `failed to delete role with id ${id}`)
        throw new HTTPException(500, {
          message: "failed to delete role"
        })
      }
    }
  }
}
