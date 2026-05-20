import { describe, expect, it, vi } from "vitest"
import { APIError } from "@/api/common.ts"
import {
  SKIP_AUTH_SESSION_EXPIRY_META,
  createAppQueryClient,
  createUserSessionExpiredRedirectHandler,
  subscribeUserSessionExpired
} from "@/lib/auth-session-expiry.ts"
import { createAuthSessionQueryOptions } from "@/lib/auth.ts"

describe("auth session expiry handling", () => {
  it("emits a session-expired event for protected query 401s", async () => {
    const queryClient = createAppQueryClient()
    const handler = vi.fn()
    const unsubscribe = subscribeUserSessionExpired(handler)

    await expect(
      queryClient.fetchQuery({
        queryKey: ["protected"],
        queryFn: () => {
          throw new APIError(401, "Unauthorized")
        },
        retry: false
      })
    ).rejects.toThrow("Unauthorized")

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith({ source: "query" })
    unsubscribe()
  })

  it("emits a session-expired event for protected mutation 401s", async () => {
    const queryClient = createAppQueryClient()
    const handler = vi.fn()
    const unsubscribe = subscribeUserSessionExpired(handler)

    await expect(
      queryClient
        .getMutationCache()
        .build(queryClient, {
          mutationFn: () => {
            throw new APIError(401, "Unauthorized")
          }
        })
        .execute(undefined)
    ).rejects.toThrow("Unauthorized")

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith({ source: "mutation" })
    unsubscribe()
  })

  it("does not emit for auth session probes", async () => {
    const queryClient = createAppQueryClient()
    const handler = vi.fn()
    const unsubscribe = subscribeUserSessionExpired(handler)

    await expect(
      queryClient.fetchQuery({
        ...createAuthSessionQueryOptions(),
        queryFn: () => {
          throw new APIError(401, "Unauthorized")
        }
      })
    ).rejects.toThrow("Unauthorized")

    expect(handler).not.toHaveBeenCalled()
    unsubscribe()
  })

  it("does not emit for auth login or logout mutations", async () => {
    const queryClient = createAppQueryClient()
    const handler = vi.fn()
    const unsubscribe = subscribeUserSessionExpired(handler)

    await expect(
      queryClient
        .getMutationCache()
        .build(queryClient, {
          meta: SKIP_AUTH_SESSION_EXPIRY_META,
          mutationFn: () => {
            throw new APIError(401, "Unauthorized")
          }
        })
        .execute(undefined)
    ).rejects.toThrow("Unauthorized")

    expect(handler).not.toHaveBeenCalled()
    unsubscribe()
  })

  it("deduplicates redirects from parallel session-expired events", async () => {
    let resolveNavigate: () => void = () => undefined
    const navigatePromise = new Promise<void>((resolve) => {
      resolveNavigate = resolve
    })
    const location = {
      href: "/findings/triage?status=active",
      pathname: "/findings/triage"
    }
    const clearSession = vi.fn()
    const navigateToLogin = vi.fn(() => navigatePromise)
    const safeLoginRedirect = vi.fn((redirect: unknown) => String(redirect))
    const handler = createUserSessionExpiredRedirectHandler({
      clearSession,
      getLocation: () => location,
      navigateToLogin,
      safeLoginRedirect
    })

    handler({ source: "query" })
    handler({ source: "mutation" })

    expect(clearSession).toHaveBeenCalledTimes(2)
    expect(safeLoginRedirect).toHaveBeenCalledTimes(1)
    expect(safeLoginRedirect).toHaveBeenCalledWith(
      "/findings/triage?status=active"
    )
    expect(navigateToLogin).toHaveBeenCalledTimes(1)
    expect(navigateToLogin).toHaveBeenCalledWith(
      "/findings/triage?status=active"
    )

    location.href = "/login?redirect=/findings/triage"
    location.pathname = "/login"
    resolveNavigate()
    await navigatePromise

    handler({ source: "query" })

    expect(navigateToLogin).toHaveBeenCalledTimes(1)
  })
})
