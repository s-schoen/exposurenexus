import { queryOptions } from "@tanstack/react-query";

import { getSession } from "@/features/auth/api/auth.ts";
import { APIError } from "@/lib/api-client.ts";
import { SKIP_UNAUTHORIZED_ERROR_META } from "@/lib/query-client.ts";

import type { AuthSessionDataReply } from "@exposurenexus/contracts/api";

export const AUTH_SESSION_QUERY_KEY = ["auth", "session"] as const;

export type AuthSessionQueryData = AuthSessionDataReply | null;

async function loadAuthSession(): Promise<AuthSessionQueryData> {
  try {
    return (await getSession()).data;
  } catch (error) {
    if (error instanceof APIError && error.statusCode === 401) {
      return null;
    }

    throw error;
  }
}

export function createAuthSessionQueryOptions() {
  return queryOptions({
    queryKey: AUTH_SESSION_QUERY_KEY,
    queryFn: loadAuthSession,
    meta: SKIP_UNAUTHORIZED_ERROR_META,
  });
}
