import { roleSchema } from "@exposurenexus/contracts/model/rbac";

import {
  apiRequest,
  parseArrayReply,
  parseErrorReply,
  parseObjectReply,
} from "@/lib/api-client.ts";

import type { CreateRole, Role, UpdateRole } from "@exposurenexus/contracts/model/rbac";

export async function listRoles(): Promise<Array<Role>> {
  const response = await apiRequest("/api/roles", {
    method: "GET",
  });

  if (!response.ok) {
    const error = await parseErrorReply(response);
    console.error(error);
    throw error;
  }

  return parseArrayReply(response, roleSchema);
}

export async function getRoleByID(id: string): Promise<Role> {
  const response = await apiRequest(`/api/roles/${id}`, {
    method: "GET",
  });

  if (!response.ok) {
    const error = await parseErrorReply(response);
    console.error(error);
    throw error;
  }

  return parseObjectReply(response, roleSchema);
}

export async function createRole(role: CreateRole): Promise<Role> {
  const response = await apiRequest("/api/roles", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(role),
  });

  if (!response.ok) {
    const error = await parseErrorReply(response);
    console.error(error);
    throw error;
  }

  return parseObjectReply(response, roleSchema);
}

export async function updateRole(id: string, role: UpdateRole): Promise<Role> {
  const response = await apiRequest(`/api/roles/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(role),
  });

  if (!response.ok) {
    const error = await parseErrorReply(response);
    console.error(error);
    throw error;
  }

  return parseObjectReply(response, roleSchema);
}

export async function deleteRole(id: string): Promise<Role> {
  const response = await apiRequest(`/api/roles/${id}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const error = await parseErrorReply(response);
    console.error(error);
    throw error;
  }

  return parseObjectReply(response, roleSchema);
}
