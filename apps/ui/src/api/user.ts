import { keepPreviousData, queryOptions } from "@tanstack/react-query"
import { userProfileSchema } from "@exposurenexus/types/model/user"
import type {
  CreateUserProfile,
  UpdateUserProfile,
  UserProfile
} from "@exposurenexus/types/model/user"
import {
  DEFAULT_QUERY_STALE_TIME,
  apiRequest,
  parseArrayReply,
  parseErrorReply,
  parseObjectReply
} from "@/api/common.ts"

async function listUsers(): Promise<Array<UserProfile>> {
  const response = await apiRequest("/api/users", {
    method: "GET"
  })

  if (!response.ok) {
    const error = await parseErrorReply(response)
    console.error(error)
    throw error
  }

  return parseArrayReply(response, userProfileSchema)
}

async function getUserByID(id: string): Promise<UserProfile> {
  const response = await apiRequest(`/api/users/${id}`, {
    method: "GET"
  })

  if (!response.ok) {
    const error = await parseErrorReply(response)
    console.error(error)
    throw error
  }

  return parseObjectReply(response, userProfileSchema)
}

export async function createUser(
  user: CreateUserProfile
): Promise<UserProfile> {
  const response = await apiRequest("/api/users", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(user)
  })

  if (!response.ok) {
    const error = await parseErrorReply(response)
    console.error(error)
    throw error
  }

  return parseObjectReply(response, userProfileSchema)
}

export async function updateUser(
  id: string,
  user: UpdateUserProfile
): Promise<UserProfile> {
  const response = await apiRequest(`/api/users/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(user)
  })

  if (!response.ok) {
    const error = await parseErrorReply(response)
    console.error(error)
    throw error
  }

  return parseObjectReply(response, userProfileSchema)
}

export function createListUsersQueryOptions() {
  return queryOptions({
    queryKey: ["users"],
    queryFn: () => listUsers(),
    placeholderData: keepPreviousData,
    staleTime: DEFAULT_QUERY_STALE_TIME
  })
}

export function createUserByIDQueryOptions(id: string) {
  return queryOptions({
    queryKey: ["users", id],
    queryFn: () => getUserByID(id)
  })
}
