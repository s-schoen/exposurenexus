import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query"
import type { Mutation, Query } from "@tanstack/react-query"
import { APIError } from "@/api/common.ts"

export const SKIP_AUTH_SESSION_EXPIRY_META = {
  skipAuthSessionExpiry: true
} as const

export interface AuthSessionExpiryMeta {
  skipAuthSessionExpiry?: boolean
}

export interface UserSessionExpiredEvent {
  source: "query" | "mutation"
}

type UserSessionExpiredHandler = (event: UserSessionExpiredEvent) => void

interface SessionExpiryLocation {
  href: string
  pathname: string
}

interface UserSessionExpiredRedirectOptions {
  clearSession: () => void
  getLocation: () => SessionExpiryLocation
  navigateToLogin: (redirect: string) => Promise<unknown> | unknown
  safeLoginRedirect: (redirect: unknown) => string
}

const userSessionExpiredHandlers = new Set<UserSessionExpiredHandler>()

function shouldSkipAuthSessionExpiry(meta: unknown): boolean {
  return (
    typeof meta === "object" &&
    meta !== null &&
    "skipAuthSessionExpiry" in meta &&
    meta.skipAuthSessionExpiry === true
  )
}

export function isUnauthorizedAPIError(error: unknown): boolean {
  return error instanceof APIError && error.statusCode === 401
}

export function shouldRetryAuthAwareQuery(
  failureCount: number,
  error: unknown
): boolean {
  if (isUnauthorizedAPIError(error)) {
    return false
  }

  return failureCount < 3
}

function notifyUserSessionExpired(event: UserSessionExpiredEvent) {
  for (const handler of userSessionExpiredHandlers) {
    handler(event)
  }
}

function handleQueryError(
  error: unknown,
  query: Query<unknown, unknown, unknown>
) {
  if (
    isUnauthorizedAPIError(error) &&
    !shouldSkipAuthSessionExpiry(query.meta)
  ) {
    notifyUserSessionExpired({ source: "query" })
  }
}

function handleMutationError(
  error: unknown,
  mutation: Mutation<unknown, unknown, unknown>
) {
  if (
    isUnauthorizedAPIError(error) &&
    !shouldSkipAuthSessionExpiry(mutation.meta)
  ) {
    notifyUserSessionExpired({ source: "mutation" })
  }
}

export function subscribeUserSessionExpired(
  handler: UserSessionExpiredHandler
): () => void {
  userSessionExpiredHandlers.add(handler)

  return () => {
    userSessionExpiredHandlers.delete(handler)
  }
}

export function createUserSessionExpiredRedirectHandler({
  clearSession,
  getLocation,
  navigateToLogin,
  safeLoginRedirect
}: UserSessionExpiredRedirectOptions): UserSessionExpiredHandler {
  let redirectInFlight = false

  return () => {
    clearSession()

    const currentLocation = getLocation()
    if (redirectInFlight || currentLocation.pathname === "/login") {
      return
    }

    redirectInFlight = true
    void Promise.resolve(
      navigateToLogin(safeLoginRedirect(currentLocation.href))
    ).finally(() => {
      redirectInFlight = false
    })
  }
}

export function createAppQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetryAuthAwareQuery
      }
    },
    queryCache: new QueryCache({
      onError: handleQueryError
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _onMutateResult, mutation) => {
        handleMutationError(error, mutation)
      }
    })
  })
}
