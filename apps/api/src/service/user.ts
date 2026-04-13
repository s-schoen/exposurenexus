import { HTTPException } from "hono/http-exception"
import type { Logger } from "pino"
import type { User } from "@openvlp/types/model/user"

interface UserRepository {
  list(): Promise<User[]>
  getByID(id: string): Promise<User | null>
}

interface UserServiceDependencies {
  userRepository: UserRepository
  logger: Logger
}

export function createUserService({
  userRepository,
  logger
}: UserServiceDependencies) {
  return {
    async listAll(): Promise<User[]> {
      try {
        return await userRepository.list()
      } catch (error) {
        logger.error(error, "failed to list users")
        throw new HTTPException(500, {
          message: "failed to list users"
        })
      }
    },

    async getByID(id: string): Promise<User | null> {
      try {
        const user = await userRepository.getByID(id)
        if (!user) {
          logger.debug(`user with id ${id} not found`)
        }
        return user
      } catch (error) {
        logger.error(error, `failed to get user with id ${id}`)
        throw new HTTPException(500, {
          message: "failed to get user"
        })
      }
    }
  }
}
