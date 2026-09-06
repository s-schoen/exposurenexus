import { keepPreviousData, queryOptions } from "@tanstack/react-query";

import { getUserByID, listUsers } from "@/features/users/api/users.ts";
import { DEFAULT_QUERY_STALE_TIME } from "@/lib/query-client.ts";

export function createListUsersQueryOptions() {
  return queryOptions({
    queryKey: ["users"],
    queryFn: () => listUsers(),
    placeholderData: keepPreviousData,
    staleTime: DEFAULT_QUERY_STALE_TIME,
  });
}

export function createUserByIDQueryOptions(id: string) {
  return queryOptions({
    queryKey: ["users", id],
    queryFn: () => getUserByID(id),
  });
}
