import { betterAuth } from "better-auth"
import { pool } from "../db/index.js"
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
