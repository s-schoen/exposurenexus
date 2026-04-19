import { HTTPException } from "hono/http-exception"
import type { Logger } from "pino"
import { BuiltInRoleName, type Role } from "@openvlp/types/model/rbac"

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

    async resolveRoleIdsFromNames(names: readonly string[]): Promise<string[]> {
      try {
        const roles = await roleRepository.getByNames(names)
        return roles.map((role) => role.id)
      } catch (error) {
        logger.error(error, "failed to resolve role ids")
        throw new HTTPException(500, {
          message: "failed to resolve role ids"
        })
      }
    },

    async resolveRoleNamesFromIds(ids: readonly string[]): Promise<string[]> {
      try {
        const roles = await roleRepository.getByIDs(ids)
        return roles.map((role) => role.name)
      } catch (error) {
        logger.error(error, "failed to resolve role names")
        throw new HTTPException(500, {
          message: "failed to resolve role names"
        })
      }
    }
  }
}
