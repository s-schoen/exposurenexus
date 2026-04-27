import { keepPreviousData } from "@tanstack/react-query"
import type {
  CreateUserProfile,
  UpdateUserProfile,
  UserProfile
} from "@openvlp/types/model/user"
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

  return parseArrayReply<UserProfile>(response)
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

  return parseObjectReply<UserProfile>(response)
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

  return parseObjectReply<UserProfile>(response)
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

  return parseObjectReply<UserProfile>(response)
}

export function createListUsersQueryOptions() {
  return {
    queryKey: ["users"],
    queryFn: () => listUsers(),
    placeholderData: keepPreviousData,
    staleTime: DEFAULT_QUERY_STALE_TIME
  }
}

export function createUserByIDQueryOptions(id: string) {
  return {
    queryKey: ["users", id],
    queryFn: () => getUserByID(id)
  }
}
