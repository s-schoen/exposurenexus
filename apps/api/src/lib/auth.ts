import { betterAuth } from "better-auth"
import { BuiltInRoleName } from "@openvlp/types/model/rbac"
import { admin, username } from "better-auth/plugins"
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
  // Better Auth admin APIs validate the caller session from request headers,
  // even when invoked from server-side code.
  setRole(input: {
    headers: Headers
    body: {
      userId: string
      role: string | string[]
    }
  }): Promise<{
    user: unknown
  }>

  removeUser(input: {
    headers: Headers
    body: {
      userId: string
    }
  }): Promise<{
    success: boolean
  }>

  setUserPassword(input: {
    headers: Headers
    body: {
      userId: string
      newPassword: string
    }
  }): Promise<{
    status: boolean
  }>
}

export interface AuthClient {
  api: AuthApiSessionClient & AuthApiSignupClient & AuthApiUserManagementClient
  handler(request: Request): Response | Promise<Response>
}

interface CreateAuthOptions {
  pool: Pool
  authUrl: string
  authSecret: string
  defaultRole: string
  adminRoles?: string[]
}

interface CreateDefaultAdminOptions {
  db: Kysely<Database>
  auth: Pick<AuthClient, "api">
  logger: Logger
}

export function createAuth({
  pool,
  authUrl,
  authSecret,
  defaultRole,
  adminRoles
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
        defaultRole,
        adminRoles
      })
    ]
  }) as unknown as AuthClient
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
