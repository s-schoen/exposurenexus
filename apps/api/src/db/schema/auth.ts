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
}
