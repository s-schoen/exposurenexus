import { useQuery } from "@tanstack/react-query"
import type { AuthSessionDataReply } from "@openvlp/types/api"
import type { UserProfile } from "@openvlp/types/model/user"
import { env } from "@/env.ts"
import { APIError, parseErrorReply, parseObjectReply } from "@/api/common.ts"

const AUTH_SESSION_QUERY_KEY = ["auth", "session"] as const
const CSRF_COOKIE = "__Host-openvlp-csrf"
const CSRF_HEADER = "X-CSRF-Token"

export type Session = AuthSessionDataReply
export type User = UserProfile

interface AuthClientResult<T> {
  data: T
}

interface SignInUsernameInput {
  username: string
  password: string
}

interface SignOutOptions {
  fetchOptions?: {
    onSuccess?: () => void
  }
}

function authUrl(path = ""): string {
  return `${env.VITE_API_URL}/api/auth${path}`
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") {
    return null
  }

  const prefix = `${name}=`
  const cookie = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))

  if (!cookie) {
    return null
  }

  return decodeURIComponent(cookie.slice(prefix.length))
}

function csrfHeaders(): HeadersInit {
  const csrfToken = readCookie(CSRF_COOKIE)
  if (!csrfToken) {
    return {}
  }

  return {
    [CSRF_HEADER]: csrfToken
  }
}

async function parseAuthSessionReply(
  response: Response
): Promise<AuthSessionDataReply> {
  if (!response.ok) {
    throw await parseErrorReply(response)
  }

  return parseObjectReply<AuthSessionDataReply>(response)
}

export async function getSession(): Promise<
  AuthClientResult<AuthSessionDataReply>
> {
  const response = await fetch(authUrl("/session"), {
    method: "GET",
    credentials: "include"
  })

  return {
    data: await parseAuthSessionReply(response)
  }
}

export const signIn = {
  async username({
    username,
    password
  }: SignInUsernameInput): Promise<AuthClientResult<AuthSessionDataReply>> {
    const response = await fetch(authUrl(), {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ username, password })
    })

    return {
      data: await parseAuthSessionReply(response)
    }
  }
}

export async function signOut(
  options: SignOutOptions = {}
): Promise<AuthClientResult<{ revoked: boolean }>> {
  const response = await fetch(authUrl(), {
    method: "DELETE",
    credentials: "include",
    headers: csrfHeaders()
  })

  if (!response.ok) {
    throw await parseErrorReply(response)
  }

  const data = await parseObjectReply<{ revoked: boolean }>(response)
  options.fetchOptions?.onSuccess?.()

  return { data }
}

function useSession() {
  return useQuery({
    queryKey: AUTH_SESSION_QUERY_KEY,
    queryFn: async () => (await getSession()).data,
    retry: (failureCount, error) => {
      if (error instanceof APIError && error.statusCode === 401) {
        return false
      }

      return failureCount < 3
    }
  })
}

export const authClient = {
  useSession,
  signIn,
  signOut,
  getSession
}
