import { PermissionResource, PermissionVerb } from "@exposurenexus/types/model/rbac";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createListRolesQueryOptions, createRoleByIDQueryOptions } from "@/api/role.ts";
import { useRoleLifecycle } from "@/hooks/use-role-lifecycle.ts";

import type * as RoleApi from "@/api/role.ts";
import type { RoleLifecycleBatchResult } from "@/hooks/use-role-lifecycle.ts";
import type { CreateRole, Role, UpdateRole } from "@exposurenexus/types/model/rbac";
import type { ReactNode } from "react";

const {
  createRoleRequestMock,
  deleteRoleRequestMock,
  toastErrorMock,
  toastSuccessMock,
  updateRoleRequestMock,
} = vi.hoisted(() => ({
  createRoleRequestMock: vi.fn(),
  deleteRoleRequestMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  updateRoleRequestMock: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    error: toastErrorMock,
    success: toastSuccessMock,
  },
}));

vi.mock("@/api/role.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof RoleApi>();

  return {
    ...actual,
    createRole: createRoleRequestMock,
    deleteRole: deleteRoleRequestMock,
    updateRole: updateRoleRequestMock,
    useCreateRoleMutation: () => ({
      mutateAsync: createRoleRequestMock,
    }),
    useDeleteRoleMutation: () => ({
      mutateAsync: deleteRoleRequestMock,
    }),
    useUpdateRoleMutation: () => ({
      mutateAsync: updateRoleRequestMock,
    }),
  };
});

function createRoleFixture(overrides: Partial<Role> = {}): Role {
  return {
    id: overrides.id ?? "9f5c0b37-7d1d-42ce-9e1a-51906b9e6830",
    name: overrides.name ?? "security-analyst",
    permissions: overrides.permissions ?? [
      { resource: PermissionResource.Asset, verb: PermissionVerb.Read },
    ],
  };
}

function createRolePayload(overrides: Partial<CreateRole> = {}): CreateRole {
  return {
    name: overrides.name ?? "security-analyst",
    permissions: overrides.permissions ?? [
      { resource: PermissionResource.Asset, verb: PermissionVerb.Read },
    ],
  };
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

function renderLifecycleHook(queryClient = createQueryClient()) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  return {
    queryClient,
    ...renderHook(() => useRoleLifecycle(), { wrapper }),
  };
}

beforeEach(() => {
  createRoleRequestMock.mockReset();
  deleteRoleRequestMock.mockReset();
  toastErrorMock.mockReset();
  toastSuccessMock.mockReset();
  updateRoleRequestMock.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("useRoleLifecycle", () => {
  it("creates roles and invalidates role list plus created detail", async () => {
    const role = createRoleFixture();
    const payload = createRolePayload();
    createRoleRequestMock.mockResolvedValueOnce(role);
    const { queryClient, result } = renderLifecycleHook();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);

    let createdRole: Role | null = null;
    await act(async () => {
      createdRole = await result.current.createRole(payload);
    });

    expect(createdRole).toEqual(role);
    expect(createRoleRequestMock).toHaveBeenCalledWith(payload);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: createListRolesQueryOptions().queryKey,
      exact: true,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: createRoleByIDQueryOptions(role.id).queryKey,
      exact: true,
    });
    expect(toastSuccessMock).toHaveBeenCalledWith("Created role security-analyst");
  });

  it("reports create failures and returns null", async () => {
    const error = new Error("Create failed");
    createRoleRequestMock.mockRejectedValueOnce(error);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { result } = renderLifecycleHook();

    let createdRole: Role | null = createRoleFixture();
    await act(async () => {
      createdRole = await result.current.createRole(createRolePayload());
    });

    expect(createdRole).toBeNull();
    expect(toastErrorMock).toHaveBeenCalledWith(`Failed to create role: ${error}`);
    expect(consoleError).toHaveBeenCalledWith(error);
  });

  it("updates roles and invalidates role list plus detail", async () => {
    const role = createRoleFixture({ name: "security-analyst-plus" });
    const payload: UpdateRole = createRolePayload({
      name: "security-analyst-plus",
    });
    updateRoleRequestMock.mockResolvedValueOnce(role);
    const { queryClient, result } = renderLifecycleHook();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);

    let updatedRole: Role | null = null;
    await act(async () => {
      updatedRole = await result.current.updateRole(role.id, payload);
    });

    expect(updatedRole).toEqual(role);
    expect(updateRoleRequestMock).toHaveBeenCalledWith({
      id: role.id,
      role: payload,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: createListRolesQueryOptions().queryKey,
      exact: true,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: createRoleByIDQueryOptions(role.id).queryKey,
      exact: true,
    });
    expect(toastSuccessMock).toHaveBeenCalledWith("Updated role security-analyst-plus");
  });

  it("deletes roles and reports a success summary", async () => {
    const role = createRoleFixture();
    deleteRoleRequestMock.mockResolvedValueOnce(role);
    const { queryClient, result } = renderLifecycleHook();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);

    let batchResult: RoleLifecycleBatchResult | undefined;
    await act(async () => {
      batchResult = await result.current.deleteRoles([role]);
    });

    expect(batchResult).toEqual({
      successful: [role],
      failed: [],
    });
    expect(deleteRoleRequestMock).toHaveBeenCalledWith(role.id);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: createListRolesQueryOptions().queryKey,
      exact: true,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: createRoleByIDQueryOptions(role.id).queryKey,
      exact: true,
    });
    expect(toastSuccessMock).toHaveBeenCalledWith("Deleted 1 role");
  });

  it("reports partial delete failures and invalidates affected reads", async () => {
    const first = createRoleFixture({
      id: "9f5c0b37-7d1d-42ce-9e1a-51906b9e6830",
      name: "security-analyst",
    });
    const second = createRoleFixture({
      id: "8f74bc56-0ac3-47ef-b7e6-8df2c42fb3c0",
      name: "security-reviewer",
    });
    const error = new Error("Delete failed");
    deleteRoleRequestMock.mockImplementation((id: string) =>
      id === first.id ? Promise.resolve(first) : Promise.reject(error),
    );
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { queryClient, result } = renderLifecycleHook();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);

    let batchResult: RoleLifecycleBatchResult | undefined;
    await act(async () => {
      batchResult = await result.current.deleteRoles([first, second]);
    });

    expect(batchResult).toMatchObject({
      successful: [first],
      failed: [{ role: second }],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: createListRolesQueryOptions().queryKey,
      exact: true,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: createRoleByIDQueryOptions(first.id).queryKey,
      exact: true,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: createRoleByIDQueryOptions(second.id).queryKey,
      exact: true,
    });
    expect(toastErrorMock).toHaveBeenCalledWith("Deleted 1 role; failed 1 role");
    expect(consoleError).toHaveBeenCalledWith(error);
  });
});
