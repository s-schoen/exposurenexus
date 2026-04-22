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
  id: string
  username: string
  email: string
  displayName: string
  enabled: boolean
  passwordHash: string
}

export interface UserSessionTable {
  id: string
  sessionId: string
  userId: string
  sourceIp: string | null
  userAgent: string | null
  createdAt: Date
  expiresAt: Date
}
