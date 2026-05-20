import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import React, { createContext, useCallback, useContext } from "react"
import type { AuthSessionQueryData, User } from "@/lib/auth.ts"
import {
  AUTH_SESSION_QUERY_KEY,
  createAuthSessionQueryOptions,
  signIn,
  signOut
} from "@/lib/auth.ts"
import { SKIP_AUTH_SESSION_EXPIRY_META } from "@/lib/auth-session-expiry.ts"

export type AuthStatus = "loading" | "authenticated" | "unauthenticated"

export interface AuthState {
  status: AuthStatus
  isAuthenticated: boolean
  user: User | null
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  ensureSession: () => Promise<boolean>
  clearSession: () => void
}

const AuthContext = createContext<AuthState | undefined>(undefined)

function isAuthSessionQueryKey(queryKey: ReadonlyArray<unknown>) {
  return (
    queryKey.length === AUTH_SESSION_QUERY_KEY.length &&
    queryKey.every((part, index) => part === AUTH_SESSION_QUERY_KEY[index])
  )
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient()
  const sessionQuery = useQuery(createAuthSessionQueryOptions())

  const clearSession = useCallback(() => {
    queryClient.removeQueries({
      predicate: (query) => !isAuthSessionQueryKey(query.queryKey)
    })
    queryClient.getMutationCache().clear()
    queryClient.setQueryData<AuthSessionQueryData>(AUTH_SESSION_QUERY_KEY, null)
  }, [queryClient])

  const loginMutation = useMutation({
    meta: SKIP_AUTH_SESSION_EXPIRY_META,
    mutationFn: async ({
      username,
      password
    }: {
      username: string
      password: string
    }) => (await signIn.username({ username, password })).data,
    onSuccess: (session) => {
      queryClient.setQueryData<AuthSessionQueryData>(
        AUTH_SESSION_QUERY_KEY,
        session
      )
    }
  })

  const logoutMutation = useMutation({
    meta: SKIP_AUTH_SESSION_EXPIRY_META,
    mutationFn: async () => {
      await signOut()
    },
    onSuccess: clearSession
  })

  const login = useCallback(
    async (username: string, password: string) => {
      await loginMutation.mutateAsync({ username, password })
    },
    [loginMutation]
  )

  const logout = useCallback(async () => {
    await logoutMutation.mutateAsync()
  }, [logoutMutation])

  const ensureSession = useCallback(async () => {
    try {
      const session = await queryClient.fetchQuery(
        createAuthSessionQueryOptions()
      )

      if (!session) {
        clearSession()
        return false
      }

      return true
    } catch {
      clearSession()
      return false
    }
  }, [clearSession, queryClient])

  const session = sessionQuery.data ?? null
  const status: AuthStatus = session
    ? "authenticated"
    : sessionQuery.isPending
      ? "loading"
      : "unauthenticated"
  const isAuthenticated = status === "authenticated"
  const user = session?.user ?? null

  return (
    <AuthContext.Provider
      value={{
        status,
        isAuthenticated,
        user,
        login,
        logout,
        ensureSession,
        clearSession
      }}
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
