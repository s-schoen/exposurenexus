import { PermissionResource, PermissionVerb } from "@exposurenexus/contracts/model/rbac";
import { act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useRoleLifecycle } from "@/features/roles/hooks/use-role-lifecycle.ts";
import {
  createListRolesQueryOptions,
  createRoleByIDQueryOptions,
} from "@/features/roles/queries/roles.ts";
import { FORBIDDEN_ACTION_MESSAGE } from "@/lib/action-error-toast.ts";
import { CUSTOM_AUDITOR_ROLE, SEED_ROLES, buildRole } from "@/mocks/fixtures/index.ts";
import { renderHookWithApp } from "@/test/harness.tsx";
import { db, mockApiError, recordApiRequests } from "@/test/msw.ts";

import type { QueryClient, QueryKey } from "@tanstack/react-query";

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

// Page flows live in roles.app.test.tsx; this covers what pages can't show: return values,
// exactly which cached reads are invalidated, and batch summaries.

const listKey = createListRolesQueryOptions().queryKey;
const detailKey = (id: string) => createRoleByIDQueryOptions(id).queryKey;
const unrelatedKey = ["users"];

function seedCache(queryClient: QueryClient) {
  queryClient.setQueryData(listKey, SEED_ROLES);
  queryClient.setQueryData(detailKey(CUSTOM_AUDITOR_ROLE.id), CUSTOM_AUDITOR_ROLE);
  queryClient.setQueryData(unrelatedKey, []);
}

const isInvalidated = (queryClient: QueryClient, key: QueryKey) =>
  queryClient.getQueryState(key)?.isInvalidated ?? false;

describe("useRoleLifecycle", () => {
  it("creates a role and invalidates only the role list", async () => {
    const { queryClient, result } = renderHookWithApp(() => useRoleLifecycle());
    seedCache(queryClient);

    let created = null;
    await act(async () => {
      created = await result.current.createRole({ name: "triager", permissions: [] });
    });

    expect(created).toEqual(db.roles.all().find((role) => role.name === "triager"));
    expect(isInvalidated(queryClient, listKey)).toBe(true);
    expect(isInvalidated(queryClient, detailKey(CUSTOM_AUDITOR_ROLE.id))).toBe(false);
    expect(isInvalidated(queryClient, unrelatedKey)).toBe(false);
    expect(toast.success).toHaveBeenCalledWith("Created role triager");
  });

  it("updates a role and invalidates its list and detail reads", async () => {
    const { queryClient, result } = renderHookWithApp(() => useRoleLifecycle());
    seedCache(queryClient);
    const permissions = [{ resource: PermissionResource.Asset, verb: PermissionVerb.Read }];

    let updated = null;
    await act(async () => {
      updated = await result.current.updateRole(CUSTOM_AUDITOR_ROLE.id, {
        name: "auditor",
        permissions,
      });
    });

    expect(updated).toEqual({ id: CUSTOM_AUDITOR_ROLE.id, name: "auditor", permissions });
    expect(isInvalidated(queryClient, listKey)).toBe(true);
    expect(isInvalidated(queryClient, detailKey(CUSTOM_AUDITOR_ROLE.id))).toBe(true);
    expect(isInvalidated(queryClient, unrelatedKey)).toBe(false);
    expect(toast.success).toHaveBeenCalledWith("Updated role auditor");
  });

  it("returns null and leaves caches alone when an update is forbidden", async () => {
    mockApiError("put", "/roles/:id", 403, "Forbidden");
    const { queryClient, result } = renderHookWithApp(() => useRoleLifecycle());
    seedCache(queryClient);

    let updated: unknown = "unset";
    await act(async () => {
      updated = await result.current.updateRole(CUSTOM_AUDITOR_ROLE.id, {
        name: "auditor",
        permissions: [],
      });
    });

    expect(updated).toBeNull();
    expect(queryClient.getQueryData(detailKey(CUSTOM_AUDITOR_ROLE.id))).toEqual(
      CUSTOM_AUDITOR_ROLE,
    );
    expect(isInvalidated(queryClient, listKey)).toBe(false);
    expect(toast.error).toHaveBeenCalledWith(FORBIDDEN_ACTION_MESSAGE);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("returns an empty summary without requests for an empty delete", async () => {
    const requests = recordApiRequests();
    const { result } = renderHookWithApp(() => useRoleLifecycle());

    let summary = null;
    await act(async () => {
      summary = await result.current.deleteRoles([]);
    });

    expect(summary).toEqual({ successful: [], failed: [] });
    expect(requests).toEqual([]);
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("pairs each failed delete with its role and still invalidates affected reads", async () => {
    const other = buildRole();
    db.roles.insert(other);
    mockApiError("delete", `/roles/${CUSTOM_AUDITOR_ROLE.id}`, 500, "Delete failed");
    const { queryClient, result } = renderHookWithApp(() => useRoleLifecycle());
    seedCache(queryClient);

    let summary: Awaited<ReturnType<typeof result.current.deleteRoles>> | null = null;
    await act(async () => {
      summary = await result.current.deleteRoles([CUSTOM_AUDITOR_ROLE, other]);
    });

    expect(summary!.successful).toEqual([other]);
    expect(summary!.failed).toEqual([
      expect.objectContaining({
        role: CUSTOM_AUDITOR_ROLE,
        error: expect.objectContaining({ statusCode: 500 }),
      }),
    ]);
    expect(isInvalidated(queryClient, listKey)).toBe(true);
    expect(isInvalidated(queryClient, unrelatedKey)).toBe(false);
    expect(toast.error).toHaveBeenCalledWith("Deleted 1 role; failed 1 role");
  });
});
