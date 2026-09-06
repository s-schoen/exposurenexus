import { keepPreviousData } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import {
  createListRolesQueryOptions,
  createRoleByIDQueryOptions,
} from "@/features/roles/queries/roles.ts";
import { DEFAULT_QUERY_STALE_TIME } from "@/lib/query-client.ts";

describe("role queries", () => {
  it("creates list query options with the established cache policy", () => {
    const options = createListRolesQueryOptions();

    expect(options.queryKey).toEqual(["roles"]);
    expect(options.placeholderData).toBe(keepPreviousData);
    expect(options.staleTime).toBe(DEFAULT_QUERY_STALE_TIME);
  });

  it("creates role detail query options", () => {
    const roleId = "9f5c0b37-7d1d-42ce-9e1a-51906b9e6830";

    expect(createRoleByIDQueryOptions(roleId).queryKey).toEqual(["roles", roleId]);
  });
});
