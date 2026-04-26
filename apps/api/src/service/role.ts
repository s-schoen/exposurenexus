import { HTTPException } from "hono/http-exception"
import type { Logger } from "pino"
import {
  builtInRoleIds,
  type Role,
  type UpdateRole
} from "@openvlp/types/model/rbac"

const protectedRoleIds = new Set<string>(Object.values(builtInRoleIds))

function uniqueValues(values: readonly string[]): string[] {
  return [...new Set(values)]
}

function isProtectedRoleId(id: string): boolean {
  return protectedRoleIds.has(id)
}

function isConflictError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }

  const errorWithCode = error as Error & { code?: string }
  const message = error.message.toLowerCase()

  return errorWithCode.code === "23505" || message.includes("duplicate")
}

interface RoleRepository {
  list(): Promise<Role[]>
  getByID(id: string): Promise<Role | null>
  getByIDs(ids: readonly string[]): Promise<Role[]>
  getByNames(names: readonly string[]): Promise<Role[]>
  updateByID(id: string, roleUpdate: UpdateRole): Promise<Role | null>
  deleteByID(id: string): Promise<Role | null>
  hasUsersWithRoleID(roleId: string): Promise<boolean>
}

interface RoleServiceDependencies {
  roleRepository: RoleRepository
  logger: Logger
}

export function createRoleService({
  roleRepository,
  logger
}: RoleServiceDependencies) {
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

    async updateByID(id: string, roleUpdate: UpdateRole): Promise<Role | null> {
      if (isProtectedRoleId(id)) {
        throw new HTTPException(403, {
          message: "built-in roles cannot be modified"
        })
      }

      try {
        const updatedRole = await roleRepository.updateByID(id, roleUpdate)
        if (!updatedRole) {
          logger.debug(`role with id ${id} not found`)
          return null
        }

        return updatedRole
      } catch (error) {
        if (error instanceof HTTPException) {
          throw error
        }

        if (isConflictError(error)) {
          logger.debug(error, "role update conflict")
          throw new HTTPException(409, {
            message: "role already exists"
          })
        }

        logger.error(error, `failed to update role with id ${id}`)
        throw new HTTPException(500, {
          message: "failed to update role"
        })
      }
    },

    async deleteByID(id: string): Promise<Role | null> {
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
