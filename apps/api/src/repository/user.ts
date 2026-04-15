import type { Database } from "../db/index.js"
import type { Kysely } from "kysely"
import type { User } from "@openvlp/types/model/user"

type UserProfileUpdate = Pick<
  Database["user"],
  "name" | "email" | "displayUsername" | "image" | "updatedAt"
>

function toUser(user: Database["user"]): User {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerified,
    image: user.image,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    username: user.username,
    displayUsername: user.displayUsername
  }
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
    },

    async updateByID(
      id: string,
      userUpdate: UserProfileUpdate
    ): Promise<User | null> {
      const user = await database
        .updateTable("user")
        .set(userUpdate)
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirst()

      return user ? toUser(user) : null
    }
  }
}
