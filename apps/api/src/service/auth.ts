import { HTTPException } from "hono/http-exception"
import type { Logger } from "pino"
import type { UserProfileInternal } from "@openvlp/types/model/user"
import { verifyPasswordHash } from "../lib/argon2.js"

const DUMMY_PASSWORD_HASH =
  "$argon2id$v=19$m=65536,t=3,p=4$Wa8M0nF1X8xS27SqOFnmsw$98GFJBEC07TapmYXC8zGbR7ARdLfDSr2t1sWeARp0Ag"

interface UserProfileRepository {
  getByUsername(username: string): Promise<UserProfileInternal | null>
}

interface AuthServiceDependencies {
  userProfileRepository: UserProfileRepository
  logger: Logger
}

export function createAuthService({
  userProfileRepository,
  logger
}: AuthServiceDependencies) {
  return {
    async checkCredentials(
      username: string,
      password: string
    ): Promise<boolean> {
      try {
        const userProfile = await userProfileRepository.getByUsername(username)
        const userProfileId = userProfile?.id
        const passwordHash = userProfile?.passwordHash ?? DUMMY_PASSWORD_HASH
        const passwordMatches = await verifyPasswordHash(password, passwordHash)
        const authenticated = Boolean(userProfile?.enabled && passwordMatches)

        if (authenticated) {
          logger.info(`user authentication success for ${username}`)
        } else {
          logger.warn(
            `user authentication failed for ${username}: ${
              userProfile && !userProfile.enabled
                ? "user_disabled"
                : "invalid_credentials"
            }`
          )
        }

        return authenticated
      } catch (error) {
        logger.error(error, "failed to check user credentials")
        throw new HTTPException(500, {
          message: "failed to check user credentials"
        })
      }
    }
  }
}
