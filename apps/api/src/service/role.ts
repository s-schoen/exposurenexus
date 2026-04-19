import { HTTPException } from "hono/http-exception"
import type { Logger } from "pino"
import type { Role } from "@openvlp/types/model/rbac"

function uniqueValues(values: readonly string[]): string[] {
  return [...new Set(values)]
}

interface RoleRepository {
  list(): Promise<Role[]>
  getByID(id: string): Promise<Role | null>
  getByIDs(ids: readonly string[]): Promise<Role[]>
  getByNames(names: readonly string[]): Promise<Role[]>
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
    }
  }
}
