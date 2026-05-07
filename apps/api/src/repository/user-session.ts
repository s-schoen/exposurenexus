import type { Database } from "../db/index.js"
import type { Kysely } from "kysely"
import type { UserSession } from "@exposurenexus/types/model/user"

export function createUserSessionRepository(database: Kysely<Database>) {
  return {
    async list(): Promise<UserSession[]> {
      return await database.selectFrom("user_session").selectAll().execute()
    },

    async getBySessionID(sessionId: string): Promise<UserSession | null> {
      const session = await database
        .selectFrom("user_session")
        .selectAll()
        .where("sessionId", "=", sessionId)
        .executeTakeFirst()

      return session || null
    },

    async create(session: Omit<UserSession, "id">): Promise<UserSession> {
      const createdSession = await database
        .insertInto("user_session")
        .values({
          ...session
        })
        .returningAll()
        .executeTakeFirst()

      return createdSession!
    },

    async deleteBySessionID(sessionId: string): Promise<UserSession | null> {
      const deletedSession = await database
        .deleteFrom("user_session")
        .where("sessionId", "=", sessionId)
        .returningAll()
        .executeTakeFirst()

      return deletedSession || null
    },

    async expireSessions(thresholdDate: Date): Promise<UserSession[]> {
      return await database
        .deleteFrom("user_session")
        .where("expiresAt", "<", thresholdDate)
        .returningAll()
        .execute()
    }
  }
}
