import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { authClient, getSession, signIn, signOut } from "./auth.ts"
import type { ReactNode } from "react"
import type { AuthSessionDataReply } from "@openvlp/types/api"

const fetchMock = vi.fn<typeof fetch>()

const authSession = {
  user: {
    id: "7b413aba-5164-456b-8ffd-88fb6b99bbed",
    username: "alice",
    displayName: "Alice Example",
    email: "alice@example.com",
    enabled: true,
    roleIds: ["viewer-role-id"]
  },
  session: {
    id: "b2d7a873-bc09-4f5a-96f9-a6f2942b6934",
    userId: "7b413aba-5164-456b-8ffd-88fb6b99bbed",
    sourceIp: "203.0.113.10",
    userAgent: "Mozilla/5.0",
    createdAt: "2026-04-26T08:00:00.000Z",
    expiresAt: "2026-04-26T20:00:00.000Z"
  }
} as unknown as AuthSessionDataReply

function jsonResponse(body: object, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json"
    },
    ...init
  })
}

function authSessionResponse(): Response {
  return jsonResponse({
    correlationId: "auth-test-request",
    data: authSession
  })
}

function errorResponse(status: number, error: string): Response {
  return jsonResponse(
    {
      correlationId: "auth-test-request",
      status,
      error
    },
    { status }
  )
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock)
  fetchMock.mockReset()
  document.cookie = "__Host-openvlp-csrf=; Max-Age=0; path=/"
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("custom auth client", () => {
  it("logs in with username credentials and includes browser credentials", async () => {
    fetchMock.mockResolvedValueOnce(authSessionResponse())

    await expect(
      signIn.username({
        username: "alice",
        password: "correct-horse-battery-staple"
      })
    ).resolves.toEqual({ data: authSession })

    expect(fetchMock).toHaveBeenCalledWith("http://localhost:3001/api/auth", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        username: "alice",
        password: "correct-horse-battery-staple"
      })
    })
  })

  it("loads the current authenticated session", async () => {
    fetchMock.mockResolvedValueOnce(authSessionResponse())

    await expect(getSession()).resolves.toEqual({ data: authSession })

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/auth/session",
      {
        method: "GET",
        credentials: "include"
      }
    )
  })

  it("surfaces unauthenticated session reads as errors", async () => {
    fetchMock.mockResolvedValueOnce(errorResponse(401, "Unauthorized"))

    await expect(getSession()).rejects.toMatchObject({
      statusCode: 401,
      message: "Unauthorized"
    })
  })

  it("logs out with the csrf token header when the cookie exists", async () => {
    vi.spyOn(document, "cookie", "get").mockReturnValue(
      "__Host-openvlp-csrf=csrf-token"
    )
    const onSuccess = vi.fn()

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        correlationId: "auth-test-request",
        data: { revoked: true }
      })
    )

    await expect(signOut({ fetchOptions: { onSuccess } })).resolves.toEqual({
      data: { revoked: true }
    })

    expect(fetchMock).toHaveBeenCalledWith("http://localhost:3001/api/auth", {
      method: "DELETE",
      credentials: "include",
      headers: {
        "X-CSRF-Token": "csrf-token"
      }
    })
    expect(onSuccess).toHaveBeenCalledOnce()
  })

  it("exposes a useSession hook backed by the current session request", async () => {
    fetchMock.mockResolvedValueOnce(authSessionResponse())
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false
        }
      }
    })
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )

    const { result } = renderHook(() => authClient.useSession(), { wrapper })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(result.current.data).toEqual(authSession)
  })
})
