import { keepPreviousData } from "@tanstack/react-query"
import type { Role, UpdateRole } from "@openvlp/types/model/rbac"
import { env } from "@/env.ts"
import {
  DEFAULT_QUERY_STALE_TIME,
  parseArrayReply,
  parseErrorReply,
  parseObjectReply
} from "@/api/common.ts"

async function listRoles(): Promise<Array<Role>> {
  const response = await fetch(`${env.VITE_API_URL}/api/roles`, {
    method: "GET",
    credentials: "include"
  })

  if (!response.ok) {
    const error = await parseErrorReply(response)
    console.error(error)
    throw error
  }

  return parseArrayReply<Role>(response)
}

async function getRoleByID(id: string): Promise<Role> {
  const response = await fetch(`${env.VITE_API_URL}/api/roles/${id}`, {
    method: "GET",
    credentials: "include"
  })

  if (!response.ok) {
    const error = await parseErrorReply(response)
    console.error(error)
    throw error
  }

  return parseObjectReply<Role>(response)
}

export async function updateRole(id: string, role: UpdateRole): Promise<Role> {
  const response = await fetch(`${env.VITE_API_URL}/api/roles/${id}`, {
    method: "PUT",
    credentials: "include",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(role)
  })

  if (!response.ok) {
    const error = await parseErrorReply(response)
    console.error(error)
    throw error
  }

  return parseObjectReply<Role>(response)
}

export async function deleteRole(id: string): Promise<Role> {
  const response = await fetch(`${env.VITE_API_URL}/api/roles/${id}`, {
    method: "DELETE",
    credentials: "include"
  })

  if (!response.ok) {
    const error = await parseErrorReply(response)
    console.error(error)
    throw error
  }

  return parseObjectReply<Role>(response)
}

export function createListRolesQueryOptions() {
  return {
    queryKey: ["roles"],
    queryFn: () => listRoles(),
    placeholderData: keepPreviousData,
    staleTime: DEFAULT_QUERY_STALE_TIME
  }
}

export function createRoleByIDQueryOptions(id: string) {
  return {
    queryKey: ["roles", id],
    queryFn: () => getRoleByID(id)
  }
}
