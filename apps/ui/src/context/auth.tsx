import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState
} from "react"
import type { User } from "@/lib/auth.ts"
import { getSession, signIn, signOut } from "@/lib/auth.ts"

export interface AuthState {
  isAuthenticated: boolean
  user: User | null
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  ensureSession: () => Promise<boolean>
}

const AuthContext = createContext<AuthState | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [, setIsLoading] = useState(false)

  const ensureSession = useCallback(async () => {
    setIsLoading(true)
    try {
      const session = await getSession()
      setIsAuthenticated(true)
      setUser(session.data!.user)
      return true
    } catch {
      setIsAuthenticated(false)
      setUser(null)
      return false
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    setIsLoading(true)
    void ensureSession()
  }, [ensureSession])

  const logout = useCallback(async () => {
    await signOut()
    setUser(null)
    setIsAuthenticated(false)
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    const data = await signIn.username({ username, password })
    setUser(data.data!.user)
    setIsAuthenticated(true)
  }, [])

  return (
    <AuthContext.Provider
      value={{ isAuthenticated, user, login, logout, ensureSession }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
