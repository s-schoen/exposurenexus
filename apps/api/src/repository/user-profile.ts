import type { Database } from "../db/index.js"
import type { Kysely } from "kysely"
import type { UserProfileInternal } from "@openvlp/types/model/user"

export function createUserProfileRepository(database: Kysely<Database>) {
  return {
    async list(): Promise<UserProfileInternal[]> {
      return await database.selectFrom("user_profile").selectAll().execute()
    },

    async getByID(id: string): Promise<UserProfileInternal | null> {
      const profile = await database
        .selectFrom("user_profile")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirst()

      return profile || null
    },

    async getByUsername(username: string): Promise<UserProfileInternal | null> {
      const profile = await database
        .selectFrom("user_profile")
        .selectAll()
        .where("username", "=", username)
        .executeTakeFirst()

      return profile || null
    },

    async create(
      userProfile: Omit<UserProfileInternal, "id">
    ): Promise<UserProfileInternal> {
      const createdProfile = await database
        .insertInto("user_profile")
        .values({
          ...userProfile
        })
        .returningAll()
        .executeTakeFirst()

      return createdProfile!
    },

    async update(
      id: string,
      updatedProfile: Omit<UserProfileInternal, "id">
    ): Promise<UserProfileInternal | null> {
      const update = await database
        .updateTable("user_profile")
        .set({
          ...updatedProfile
        })
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirst()

      return update || null
    },

    async deleteByID(id: string): Promise<UserProfileInternal | null> {
      const deletedProfile = await database
        .deleteFrom("user_profile")
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirst()

      return deletedProfile || null
    }
  }
}
