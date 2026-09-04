import { keepPreviousData } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import {
  createListUsersQueryOptions,
  createUserByIDQueryOptions,
} from "@/features/users/queries/users.ts";
import { DEFAULT_QUERY_STALE_TIME } from "@/lib/query-client.ts";

describe("user queries", () => {
  it("creates list query options with the established cache policy", () => {
    const options = createListUsersQueryOptions();

    expect(options.queryKey).toEqual(["users"]);
    expect(options.placeholderData).toBe(keepPreviousData);
    expect(options.staleTime).toBe(DEFAULT_QUERY_STALE_TIME);
  });

  it("creates user detail query options", () => {
    const userId = "1f9c36d2-1355-49d1-8464-b01ce955d88f";

    expect(createUserByIDQueryOptions(userId).queryKey).toEqual(["users", userId]);
  });
});
