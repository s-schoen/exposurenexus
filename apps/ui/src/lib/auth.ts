import { useQuery } from "@tanstack/react-query"
import type { AuthSessionDataReply } from "@openvlp/types/api"
import type { UserProfile } from "@openvlp/types/model/user"
import {
  APIError,
  apiRequest,
  parseErrorReply,
  parseObjectReply
} from "@/api/common.ts"

const AUTH_SESSION_QUERY_KEY = ["auth", "session"] as const

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
  const response = await apiRequest("/api/auth/session", {
    method: "GET"
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
    const response = await apiRequest(
      "/api/auth",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ username, password })
      },
      { csrf: false }
    )

    return {
      data: await parseAuthSessionReply(response)
    }
  }
}

export async function signOut(
  options: SignOutOptions = {}
): Promise<AuthClientResult<{ revoked: boolean }>> {
  const response = await apiRequest("/api/auth", {
    method: "DELETE"
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
