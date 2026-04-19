import { betterAuth } from "better-auth"
import { BuiltInRoleName, type Role } from "@openvlp/types/model/rbac"
import { admin, username } from "better-auth/plugins"
import {
  ac,
  buildBetterAuthRoleConfig,
  type ApiPermissionPayload,
  type BetterAuthRoles
} from "./permissions.js"
import type { Kysely } from "kysely"
import type { Database } from "../db/index.js"
import type { Logger } from "pino"
import type { Pool } from "pg"

export interface AuthApiSessionClient {
  getSession(input: { headers: Headers }): Promise<{
    user: unknown
    session: unknown
  } | null>
}

export interface AuthApiSignupClient {
  signUpEmail(input: {
    body: {
      username: string
      name: string
      displayUsername: string
      email: string
      password: string
    }
  }): Promise<{
    user: {
      id: string
    }
  }>
}

export interface AuthApiUserManagementClient {
  setRole(input: {
    body: {
      userId: string
      role: string | string[]
    }
  }): Promise<{
    user?: unknown
    success?: boolean
    status?: boolean
  }>

  setUserPassword(input: {
    body: {
      userId: string
      newPassword: string
    }
  }): Promise<{
    success?: boolean
    status?: boolean
  }>
}

export interface AuthApiPermissionClient {
  userHasPermission(input: {
    body: {
      userId: string
      permissions: ApiPermissionPayload
    }
  }): Promise<boolean>
}

export interface AuthClient {
  api: AuthApiSessionClient &
    AuthApiSignupClient &
    AuthApiUserManagementClient &
    AuthApiPermissionClient
  handler(request: Request): Response | Promise<Response>
}

export interface ReloadableAuthClient extends AuthClient {
  reload(auth: AuthClient): void
}

interface CreateAuthOptions {
  pool: Pool
  authUrl: string
  authSecret: string
  roles: BetterAuthRoles
  defaultRole: string
}

interface CreateDefaultAdminOptions {
  db: Kysely<Database>
  auth: Pick<AuthClient, "api">
  logger: Logger
}

interface ReloadAuthFromRolesOptions {
  auth: ReloadableAuthClient
  listRoles: () => Promise<Role[]>
  pool: Pool
  authUrl: string
  authSecret: string
  defaultRole: string
}

export function createAuth({
  pool,
  authUrl,
  authSecret,
  roles,
  defaultRole
}: CreateAuthOptions): AuthClient {
  return betterAuth({
    database: pool,
    appName: "openvlp",
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false
    },
    baseURL: authUrl,
    secret: authSecret,
    plugins: [
      username(),
      admin({
        ac,
        roles,
        defaultRole
      })
    ]
  }) as unknown as AuthClient
}

export function createReloadableAuth(
  initialAuth: AuthClient
): ReloadableAuthClient {
  let currentAuth = initialAuth

  return {
    api: {
      getSession(input) {
        return currentAuth.api.getSession(input)
      },

      signUpEmail(input) {
        return currentAuth.api.signUpEmail(input)
      },

      setRole(input) {
        return currentAuth.api.setRole(input)
      },

      setUserPassword(input) {
        return currentAuth.api.setUserPassword(input)
      },

      userHasPermission(input) {
        return currentAuth.api.userHasPermission(input)
      }
    },

    handler(request) {
      return currentAuth.handler(request)
    },

    reload(auth) {
      currentAuth = auth
    }
  }
}

export async function reloadAuthFromRoles({
  auth,
  listRoles,
  pool,
  authUrl,
  authSecret,
  defaultRole
}: ReloadAuthFromRolesOptions): Promise<void> {
  const runtimeRoles = await listRoles()
  const authRoleConfig = buildBetterAuthRoleConfig(runtimeRoles)

  auth.reload(
    createAuth({
      pool,
      authUrl,
      authSecret,
      roles: authRoleConfig.roles,
      defaultRole
    })
  )
}

export async function createDefaultAdmin(
  options: CreateDefaultAdminOptions
): Promise<void> {
  const { count } = await options.db
    .selectFrom("user")
    .select(options.db.fn.countAll<number>().as("count"))
    .executeTakeFirstOrThrow()

  if (count > 0) {
    options.logger.debug("admin user already exists")
    return
  }

  const password = crypto.randomUUID()

  const created = await options.auth.api.signUpEmail({
    body: {
      username: "admin",
      name: "Administrator",
      displayUsername: "Administrator",
      email: "admin@localhost.loc",
      password: password
    }
  })

  await options.db
    .updateTable("user")
    .set({ role: BuiltInRoleName.Admin })
    .where("id", "=", created.user.id)
    .returning("id")
    .executeTakeFirstOrThrow()

  options.logger.info(
    `created admin user: username=admin, password=${password}`
  )
}
