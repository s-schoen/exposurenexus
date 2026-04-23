import type { Generated } from "kysely"

export interface UserTable {
  id: string
  name: string
  email: string
  emailVerified: boolean
  image: string | null
  createdAt: Date
  updatedAt: Date
  username: string | null
  displayUsername: string | null
  role: string | null
  banned: boolean | null
  banReason: string | null
  banExpires: Date | null
}

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
