import { useQuery } from "@tanstack/react-query";

import { createAuthSessionQueryOptions } from "@/features/auth/queries/session.ts";

import type { UserProfile } from "@exposurenexus/contracts/model/user";

/**
 * The signed-in user, from the session the app shell has already loaded. It only reads the
 * cache, never fetching, so it works outside `AuthProvider` too, returning null there.
 */
export function useSignedInUser(): UserProfile | null {
  const session = useQuery({ ...createAuthSessionQueryOptions(), enabled: false });

  return session.data?.user ?? null;
}
