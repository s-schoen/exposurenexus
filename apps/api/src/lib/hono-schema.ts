import type { User } from "better-auth"

export type AuthenticatedUser = User & {
  // Better Auth stores multiple roles in this single column as a comma-separated string.
  role: string
}

export interface ContextVariables {
  user: AuthenticatedUser | null
  session: unknown | null
}
