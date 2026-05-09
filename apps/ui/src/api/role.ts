import { keepPreviousData } from "@tanstack/react-query"
import type {
  CreateRole,
  Role,
  UpdateRole
} from "@exposurenexus/types/model/rbac"
import {
  DEFAULT_QUERY_STALE_TIME,
  apiRequest,
  parseArrayReply,
  parseErrorReply,
  parseObjectReply
} from "@/api/common.ts"

async function listRoles(): Promise<Array<Role>> {
  const response = await apiRequest("/api/roles", {
    method: "GET"
  })

  if (!response.ok) {
    const error = await parseErrorReply(response)
    console.error(error)
    throw error
  }

  return parseArrayReply<Role>(response)
}

async function getRoleByID(id: string): Promise<Role> {
  const response = await apiRequest(`/api/roles/${id}`, {
    method: "GET"
  })

  if (!response.ok) {
    const error = await parseErrorReply(response)
    console.error(error)
    throw error
  }

  return parseObjectReply<Role>(response)
}

export async function createRole(role: CreateRole): Promise<Role> {
  const response = await apiRequest("/api/roles", {
    method: "POST",
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

export async function updateRole(id: string, role: UpdateRole): Promise<Role> {
  const response = await apiRequest(`/api/roles/${id}`, {
    method: "PUT",
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
  const response = await apiRequest(`/api/roles/${id}`, {
    method: "DELETE"
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
