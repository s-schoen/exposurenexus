import { userProfileSchema } from "@exposurenexus/contracts/model/user";

import {
  apiRequest,
  parseArrayReply,
  parseErrorReply,
  parseObjectReply,
} from "@/lib/api-client.ts";

import type {
  CreateUserProfile,
  UpdateUserProfile,
  UserProfile,
} from "@exposurenexus/contracts/model/user";

export async function listUsers(): Promise<Array<UserProfile>> {
  const response = await apiRequest("/api/users", {
    method: "GET",
  });

  if (!response.ok) {
    const error = await parseErrorReply(response);
    console.error(error);
    throw error;
  }

  return parseArrayReply(response, userProfileSchema);
}

export async function getUserByID(id: string): Promise<UserProfile> {
  const response = await apiRequest(`/api/users/${id}`, {
    method: "GET",
  });

  if (!response.ok) {
    const error = await parseErrorReply(response);
    console.error(error);
    throw error;
  }

  return parseObjectReply(response, userProfileSchema);
}

export async function createUser(user: CreateUserProfile): Promise<UserProfile> {
  const response = await apiRequest("/api/users", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(user),
  });

  if (!response.ok) {
    const error = await parseErrorReply(response);
    console.error(error);
    throw error;
  }

  return parseObjectReply(response, userProfileSchema);
}

export async function updateUser(id: string, user: UpdateUserProfile): Promise<UserProfile> {
  const response = await apiRequest(`/api/users/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(user),
  });

  if (!response.ok) {
    const error = await parseErrorReply(response);
    console.error(error);
    throw error;
  }

  return parseObjectReply(response, userProfileSchema);
}
