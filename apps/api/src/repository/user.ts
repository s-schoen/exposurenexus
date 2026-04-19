import type { Database } from "../db/index.js"
import type { Kysely } from "kysely"
import {
  BuiltInRoleName,
  builtInRoleIds,
  builtInRoles,
  type BuiltInRoleId
} from "@openvlp/types/model/rbac"
import type { User } from "@openvlp/types/model/user"

type UserProfileUpdate = Pick<
  Database["user"],
  "name" | "email" | "displayUsername" | "image" | "updatedAt"
> & {
  roleIds?: BuiltInRoleId[]
}

const builtInRoleByName = new Map(builtInRoles.map((role) => [role.name, role]))
const builtInRoleIdByName: Record<BuiltInRoleName, BuiltInRoleId> = {
  [BuiltInRoleName.Viewer]: builtInRoleIds[BuiltInRoleName.Viewer],
  [BuiltInRoleName.Editor]: builtInRoleIds[BuiltInRoleName.Editor],
  [BuiltInRoleName.Admin]: builtInRoleIds[BuiltInRoleName.Admin]
}

function toUserRoleIds(roleValue: string | null): BuiltInRoleId[] {
  if (!roleValue) {
    return []
  }

  return roleValue
    .split(",")
    .map((value) => value.trim())
    .filter((value): value is BuiltInRoleName => builtInRoleByName.has(value))
    .map((value) => builtInRoleIdByName[value])
}

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
    displayUsername: user.displayUsername,
    roleIds: toUserRoleIds(user.role)
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
      const { roleIds: _roleIds, ...persistedUserUpdate } = userUpdate

      const user = await database
        .updateTable("user")
        .set(persistedUserUpdate)
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirst()

      return user ? toUser(user) : null
    }
  }
}
