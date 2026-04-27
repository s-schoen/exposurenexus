import type { Generated } from "kysely"

export interface UserProfileTable {
  id: Generated<string>
  username: string
  email: string
  displayName: string
  enabled: boolean
  passwordHash: string
}

export interface UserSessionTable {
  id: Generated<string>
  sessionId: string
  userId: string
  sourceIp: string | null
  userAgent: string | null
  createdAt: Date
  expiresAt: Date
}
