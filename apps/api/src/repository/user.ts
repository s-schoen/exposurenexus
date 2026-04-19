import { sql } from "kysely"
import type { Database } from "../db/index.js"
import type { Kysely } from "kysely"
import type { User } from "@openvlp/types/model/user"

// better-auth persists roles as a comma-separated name string on the user row.
// The repository keeps that storage-oriented shape, while the service resolves
// those role names to API-facing roleIds through the role service.
export type PersistedUser = Omit<User, "roleIds"> & {
  roleNames: string[]
}

type UserProfileUpdate = Pick<
  Database["user"],
  "name" | "email" | "displayUsername" | "image" | "updatedAt"
>

function toRoleNames(roleValue: string | null): string[] {
  if (!roleValue) {
    return []
  }

  const roleNames: string[] = []
  const seenRoleNames = new Set<string>()

  for (const roleName of roleValue.split(",").map((value) => value.trim())) {
    if (roleName.length === 0 || seenRoleNames.has(roleName)) {
      continue
    }

    seenRoleNames.add(roleName)
    roleNames.push(roleName)
  }

  return roleNames
}

function toPersistedUser(user: Database["user"]): PersistedUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerified,
    image: user.image,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    username: user.username,
    displayUsername: user.displayUsername,
    roleNames: toRoleNames(user.role)
  }
}

export function createUserRepository(database: Kysely<Database>) {
  return {
    async list(): Promise<PersistedUser[]> {
      const users = await database.selectFrom("user").selectAll().execute()
      return users.map(toPersistedUser)
    },

    async getByID(id: string): Promise<PersistedUser | null> {
      const user = await database
        .selectFrom("user")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirst()

      return user ? toPersistedUser(user) : null
    },

    async updateByID(
      id: string,
      userUpdate: UserProfileUpdate
    ): Promise<PersistedUser | null> {
      const user = await database
        .updateTable("user")
        .set(userUpdate)
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirst()

      return user ? toPersistedUser(user) : null
    },

    async hasUsersWithRoleName(roleName: string): Promise<boolean> {
      const result = await database
        .selectFrom("user")
        .select(({ fn }) => fn.countAll<number>().as("count"))
        .where("role", "is not", null)
        .where(
          sql<boolean>`${roleName} = any(string_to_array(replace(${sql.ref("user.role")}, ' ', ''), ','))`
        )
        .executeTakeFirstOrThrow()

      return result.count > 0
    }
  }
}
