import { betterAuth } from "better-auth"
import { db, pool, logger as dbLogger } from "../db/index.js"
import { env } from "../env.js"
import { username } from "better-auth/plugins"

export const auth = betterAuth({
  database: pool,
  appName: "openvlp",
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false
  },
  baseURL: env.AUTH_URL,
  secret: env.AUTH_SECRET,
  plugins: [username()]
})

export async function createDefaultAdmin(): Promise<void> {
  const { count } = await db
    .selectFrom("user")
    .select(db.fn.countAll<number>().as("count"))
    .executeTakeFirstOrThrow()

  if (count > 0) {
    dbLogger.debug("admin user already exists")
    return
  }

  const password = crypto.randomUUID()

  await auth.api.signUpEmail({
    body: {
      username: "admin",
      name: "Administrator",
      displayUsername: "Administrator",
      email: "admin@localhost.loc",
      password: password
    }
  })

  dbLogger.info(`created admin user: username=admin, password=${password}`)
}
