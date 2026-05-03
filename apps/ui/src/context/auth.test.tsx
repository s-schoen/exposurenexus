import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import type { User } from "@/lib/auth.ts"
import type { AuthProvider } from "@/context/auth.tsx"

const mocks = vi.hoisted(() => {
  const alice: User = {
    id: "7b413aba-5164-456b-8ffd-88fb6b99bbed",
    username: "alice",
    displayName: "Alice Example",
    email: "alice@example.com",
    enabled: true,
    roleIds: ["viewer-role-id"]
  }
  const bob: User = {
    id: "47f1c881-03d6-4fdf-a837-33e5eb1678b1",
    username: "bob",
    displayName: "Bob Example",
    email: "bob@example.com",
    enabled: true,
    roleIds: ["admin-role-id"]
  }

  return {
    alice,
    bob,
    getSession: vi.fn(),
    signInUsername: vi.fn(),
    signOut: vi.fn()
  }
})

vi.mock("@/lib/auth.ts", () => ({
  getSession: mocks.getSession,
  signIn: {
    username: mocks.signInUsername
  },
  signOut: mocks.signOut
}))

function sessionReply(user: User) {
  return {
    data: {
      user
    }
  }
}

function createWrapper(Provider: typeof AuthProvider) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <Provider>{children}</Provider>
  }
}

describe("AuthProvider", () => {
  beforeEach(() => {
    mocks.getSession.mockReset()
    mocks.signInUsername.mockReset()
    mocks.signOut.mockReset()
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it("loads the current session on mount", async () => {
    const { AuthProvider, useAuth } = await import("@/context/auth.tsx")
    mocks.getSession.mockResolvedValueOnce(sessionReply(mocks.alice))

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(AuthProvider)
    })

    await waitFor(() => {
      expect(result.current.isAuthenticated).toBe(true)
    })
    expect(result.current.user).toEqual(mocks.alice)
    expect(mocks.getSession).toHaveBeenCalledTimes(1)
  })

  it("exposes unauthenticated state when session loading fails", async () => {
    const { AuthProvider, useAuth } = await import("@/context/auth.tsx")
    mocks.getSession.mockRejectedValueOnce(new Error("Unauthorized"))

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(AuthProvider)
    })

    await waitFor(() => {
      expect(mocks.getSession).toHaveBeenCalledTimes(1)
    })
    expect(result.current.isAuthenticated).toBe(false)
    expect(result.current.user).toBeNull()
  })

  it("refreshes auth state through ensureSession", async () => {
    const { AuthProvider, useAuth } = await import("@/context/auth.tsx")
    mocks.getSession
      .mockRejectedValueOnce(new Error("Unauthorized"))
      .mockResolvedValueOnce(sessionReply(mocks.bob))

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(AuthProvider)
    })

    await waitFor(() => {
      expect(mocks.getSession).toHaveBeenCalledTimes(1)
    })

    let hasSession!: boolean
    await act(async () => {
      hasSession = await result.current.ensureSession()
    })

    expect(hasSession).toBe(true)
    expect(result.current.isAuthenticated).toBe(true)
    expect(result.current.user).toEqual(mocks.bob)
  })

  it("updates auth state after login and logout", async () => {
    const { AuthProvider, useAuth } = await import("@/context/auth.tsx")
    mocks.getSession.mockRejectedValueOnce(new Error("Unauthorized"))
    mocks.signInUsername.mockResolvedValueOnce(sessionReply(mocks.alice))
    mocks.signOut.mockResolvedValueOnce({ data: { revoked: true } })

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(AuthProvider)
    })

    await waitFor(() => {
      expect(mocks.getSession).toHaveBeenCalledTimes(1)
    })

    await act(async () => {
      await result.current.login("alice", "correct-horse-battery-staple")
    })

    expect(mocks.signInUsername).toHaveBeenCalledWith({
      username: "alice",
      password: "correct-horse-battery-staple"
    })
    expect(result.current.isAuthenticated).toBe(true)
    expect(result.current.user).toEqual(mocks.alice)

    await act(async () => {
      await result.current.logout()
    })

    expect(mocks.signOut).toHaveBeenCalledTimes(1)
    expect(result.current.isAuthenticated).toBe(false)
    expect(result.current.user).toBeNull()
  })

  it("throws when useAuth is used outside the provider", async () => {
    const { useAuth } = await import("@/context/auth.tsx")

    expect(() => renderHook(() => useAuth())).toThrow(
      "useAuth must be used within an AuthProvider"
    )
  })
})
