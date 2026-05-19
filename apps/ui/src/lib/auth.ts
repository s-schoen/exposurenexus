import { useQuery } from "@tanstack/react-query"
import { z } from "zod/v4"
import { dateSchema } from "@exposurenexus/types/model/date"
import { userProfileSchema } from "@exposurenexus/types/model/user"
import type { AuthSessionDataReply } from "@exposurenexus/types/api"
import type { UserProfile } from "@exposurenexus/types/model/user"
import {
  APIError,
  apiRequest,
  parseErrorReply,
  parseObjectReply
} from "@/api/common.ts"

const AUTH_SESSION_QUERY_KEY = ["auth", "session"] as const
const authSessionReplySchema = z.strictObject({
  user: userProfileSchema,
  session: z.strictObject({
    id: z.uuidv4(),
    userId: z.uuidv4(),
    sourceIp: z.string().nullable(),
    userAgent: z.string().nullable(),
    createdAt: dateSchema,
    expiresAt: dateSchema
  })
})
const signOutReplySchema = z.strictObject({
  revoked: z.boolean()
})

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

  return parseObjectReply(response, authSessionReplySchema)
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

  const data = await parseObjectReply(response, signOutReplySchema)
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
