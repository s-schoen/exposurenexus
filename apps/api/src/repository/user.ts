import type { Database } from "../db/index.js"
import type { UserTable } from "../db/schema/auth.js"
import type { Kysely, Selectable } from "kysely"

export type User = Selectable<UserTable>

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
