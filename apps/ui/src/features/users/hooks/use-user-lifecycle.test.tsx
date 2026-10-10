import { act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useUserLifecycle } from "@/features/users/hooks/use-user-lifecycle.ts";
import {
  createListUsersQueryOptions,
  createUserByIDQueryOptions,
} from "@/features/users/queries/users.ts";
import { SEED_USERS } from "@/mocks/fixtures/index.ts";
import { renderHookWithApp } from "@/test/harness.tsx";
import { db, mockApiError } from "@/test/msw.ts";

import type { QueryClient, QueryKey } from "@tanstack/react-query";

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

// Page flows live in users.app.test.tsx; this covers return values and cache effects.

const [, MORGAN] = SEED_USERS;
const listKey = createListUsersQueryOptions().queryKey;
const detailKey = createUserByIDQueryOptions(MORGAN.id).queryKey;
const unrelatedKey = ["roles"];

function seedCache(queryClient: QueryClient) {
  queryClient.setQueryData(listKey, SEED_USERS);
  queryClient.setQueryData(detailKey, MORGAN);
  queryClient.setQueryData(unrelatedKey, []);
}

const isInvalidated = (queryClient: QueryClient, key: QueryKey) =>
  queryClient.getQueryState(key)?.isInvalidated ?? false;

const { id: _, ...profile } = MORGAN;
// The update contract has no username: usernames are immutable.
const { username: __, ...update } = profile;

describe("useUserLifecycle", () => {
  it("creates a user and invalidates the user list", async () => {
    const { queryClient, result } = renderHookWithApp(() => useUserLifecycle());
    seedCache(queryClient);

    let created = null;
    await act(async () => {
      created = await result.current.createUser({
        ...profile,
        username: "jamie",
        email: "jamie@example.com",
        displayName: "Jamie",
        password: "secret",
      });
    });

    expect(created).toEqual(db.users.all().find((user) => user.username === "jamie"));
    expect(isInvalidated(queryClient, listKey)).toBe(true);
    expect(isInvalidated(queryClient, unrelatedKey)).toBe(false);
    expect(toast.success).toHaveBeenCalledWith("Created user Jamie");
  });

  it("writes the updated user to its detail cache and invalidates user reads", async () => {
    const { queryClient, result } = renderHookWithApp(() => useUserLifecycle());
    seedCache(queryClient);

    let updated = null;
    await act(async () => {
      updated = await result.current.updateUser(MORGAN.id, {
        ...update,
        displayName: "Morgan Lead",
      });
    });

    expect(updated).toEqual({ ...MORGAN, displayName: "Morgan Lead" });
    expect(queryClient.getQueryData(detailKey)).toEqual(updated);
    expect(isInvalidated(queryClient, listKey)).toBe(true);
    expect(isInvalidated(queryClient, unrelatedKey)).toBe(false);
    expect(toast.success).toHaveBeenCalledWith("Updated user Morgan Lead");
  });

  it("returns null and reports the error when an update fails", async () => {
    mockApiError("put", "/users/:id", 500, "Update failed");
    const { queryClient, result } = renderHookWithApp(() => useUserLifecycle());
    seedCache(queryClient);

    let updated: unknown = "unset";
    await act(async () => {
      updated = await result.current.updateUser(MORGAN.id, update);
    });

    expect(updated).toBeNull();
    expect(queryClient.getQueryData(detailKey)).toEqual(MORGAN);
    expect(isInvalidated(queryClient, listKey)).toBe(false);
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("Update failed"));
  });
});
