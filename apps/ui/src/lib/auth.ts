import { createAuthClient } from "better-auth/react"
import { usernameClient } from "better-auth/client/plugins"
import { env } from "@/env.ts"

export const authClient = createAuthClient({
  baseURL: env.VITE_API_URL,
  plugins: [usernameClient()]
})

export const { useSession, signIn, signOut, getSession } = authClient

export type Session = typeof authClient.$Infer.Session
export type User = typeof authClient.$Infer.Session.user
