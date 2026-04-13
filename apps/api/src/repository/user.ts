import type { Database } from "../db/index.js"
import type { Kysely } from "kysely"
import type { User } from "@openvlp/types/model/user"

export function createUserRepository(database: Kysely<Database>) {
  return {
    async list(): Promise<User[]> {
      return await database.selectFrom("user").selectAll().execute()
    },

    async getByID(id: string): Promise<User | null> {
      const user = await database
        .selectFrom("user")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirst()

      return user || null
    }
  }
}
