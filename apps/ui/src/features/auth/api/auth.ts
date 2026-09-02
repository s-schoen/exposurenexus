import {
  authLoginSchema,
  authSessionDataReplySchema,
  authSignOutDataReplySchema,
} from "@exposurenexus/contracts/api";

import { apiRequest, parseErrorReply, parseObjectReply } from "@/lib/api-client.ts";

import type {
  AuthLogin,
  AuthSessionDataReply,
  AuthSignOutDataReply,
} from "@exposurenexus/contracts/api";

interface AuthClientResult<T> {
  data: T;
}

interface SignOutOptions {
  fetchOptions?: {
    onSuccess?: () => void;
  };
}

async function parseAuthSessionReply(response: Response): Promise<AuthSessionDataReply> {
  if (!response.ok) {
    throw await parseErrorReply(response);
  }

  return parseObjectReply(response, authSessionDataReplySchema);
}

export async function getSession(): Promise<AuthClientResult<AuthSessionDataReply>> {
  const response = await apiRequest("/api/auth/session", {
    method: "GET",
  });

  return {
    data: await parseAuthSessionReply(response),
  };
}

export const signIn = {
  async username(input: AuthLogin): Promise<AuthClientResult<AuthSessionDataReply>> {
    const { username, password } = authLoginSchema.parse(input);
    const response = await apiRequest(
      "/api/auth",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      },
      { csrf: false },
    );

    return {
      data: await parseAuthSessionReply(response),
    };
  },
};

export async function signOut(
  options: SignOutOptions = {},
): Promise<AuthClientResult<AuthSignOutDataReply>> {
  const response = await apiRequest("/api/auth", {
    method: "DELETE",
  });

  if (!response.ok) {
    throw await parseErrorReply(response);
  }

  const data = await parseObjectReply(response, authSignOutDataReplySchema);
  options.fetchOptions?.onSuccess?.();

  return { data };
}
