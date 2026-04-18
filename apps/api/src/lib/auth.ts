import { betterAuth } from "better-auth"
import { BuiltInRoleName } from "@openvlp/types/model/rbac"
import { db, pool, logger as dbLogger } from "../db/index.js"
import { env } from "../env.js"
import { admin, username } from "better-auth/plugins"
import { ac, roles } from "./permissions.js"
import type { Kysely } from "kysely"
import type { Database } from "../db/index.js"
import type { Logger } from "pino"
import type { Pool } from "pg"
import type { ApiPermissionPayload } from "./permissions.js"

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

interface CreateAuthOptions {
  pool: Pool
  authUrl: string
  authSecret: string
}

interface CreateDefaultAdminOptions {
  db: Kysely<Database>
  auth: Pick<AuthClient, "api">
  logger: Logger
}

export function createAuth({
  pool,
  authUrl,
  authSecret
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
        defaultRole: BuiltInRoleName.Viewer
      })
    ]
  }) as unknown as AuthClient
}

export const auth = createAuth({
  pool,
  authUrl: env.AUTH_URL,
  authSecret: env.AUTH_SECRET
})

export async function createDefaultAdmin(
  options: CreateDefaultAdminOptions = {
    db,
    auth,
    logger: dbLogger
  }
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
