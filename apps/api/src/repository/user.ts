import type { Database } from "../db/index.js"
import type { Kysely } from "kysely"
import type { User } from "@openvlp/types/model/user"

function toUser({
  role: _role,
  banned: _banned,
  banReason: _banReason,
  banExpires: _banExpires,
  ...user
}: Database["user"]): User {
  return user
}

export function createUserRepository(database: Kysely<Database>) {
  return {
    async list(): Promise<User[]> {
      const users = await database.selectFrom("user").selectAll().execute()
      return users.map(toUser)
    },

    async getByID(id: string): Promise<User | null> {
      const user = await database
        .selectFrom("user")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirst()

      return user ? toUser(user) : null
    }
  }
}
