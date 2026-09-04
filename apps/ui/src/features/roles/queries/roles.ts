import { keepPreviousData, queryOptions } from "@tanstack/react-query";

import { getRoleByID, listRoles } from "@/features/roles/api/roles.ts";
import { DEFAULT_QUERY_STALE_TIME } from "@/lib/query-client.ts";

export function createListRolesQueryOptions() {
  return queryOptions({
    queryKey: ["roles"],
    queryFn: () => listRoles(),
    placeholderData: keepPreviousData,
    staleTime: DEFAULT_QUERY_STALE_TIME,
  });
}

export function createRoleByIDQueryOptions(id: string) {
  return queryOptions({
    queryKey: ["roles", id],
    queryFn: () => getRoleByID(id),
  });
}
