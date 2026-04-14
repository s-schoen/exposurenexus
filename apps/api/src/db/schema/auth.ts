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
