import { PermissionResource, PermissionVerb } from "@exposurenexus/types/model/rbac";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EditRolePage } from "@/features/roles/components/edit-role-page.tsx";

import type { RoleFormValues } from "@/components/role-form.tsx";
import type { Role } from "@exposurenexus/types/model/rbac";

interface QueryState<TData> {
  data?: TData;
  error?: Error;
  isPending: boolean;
  isSuccess: boolean;
}

const roleId = "9f5c0b37-7d1d-42ce-9e1a-51906b9e6830";

const mocks = vi.hoisted(() => {
  const role: Role = {
    id: "9f5c0b37-7d1d-42ce-9e1a-51906b9e6830",
    name: "security-analyst",
    permissions: [
      { resource: "asset", verb: "read" },
      { resource: "finding", verb: "read" },
    ],
  } as Role;
  const roles: Array<Role> = [
    {
      id: "6d0d8a47-0f6d-47b6-9b9a-d8f0d3f4dd01",
      name: "viewer",
      permissions: [
        { resource: "asset", verb: "read" },
        { resource: "finding", verb: "read" },
      ],
    },
    {
      id: "5d5f5c6f-a9d6-4d49-9f4d-9462b873a902",
      name: "editor",
      permissions: [
        { resource: "asset", verb: "read" },
        { resource: "asset", verb: "write" },
        { resource: "finding", verb: "read" },
      ],
    },
  ] as Array<Role>;
  const submitValues: RoleFormValues = {
    name: "  security-analyst-plus  ",
    permissions: [
      { resource: "asset", verb: "read" },
      { resource: "asset", verb: "write" },
    ],
  } as RoleFormValues;
  const roleQuery: QueryState<Role> = {
    data: role,
    isPending: false,
    isSuccess: true,
  };
  const rolesQuery: QueryState<Array<Role>> = {
    data: roles,
    isPending: false,
    isSuccess: true,
  };

  return {
    navigate: vi.fn(),
    role,
    roleQuery,
    roles,
    rolesQuery,
    submitValues,
    updateRole: vi.fn(),
    usePageMeta: vi.fn(),
  };
});

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey: Array<string> }) => {
    if (options.queryKey.join("/") === "roles") {
      return mocks.rolesQuery;
    }

    return mocks.roleQuery;
  },
}));

vi.mock("@/api/role.ts", () => ({
  createListRolesQueryOptions: () => ({
    queryKey: ["roles"],
  }),
  createRoleByIDQueryOptions: (id: string) => ({
    queryKey: ["roles", id],
  }),
}));

vi.mock("@/hooks/use-role-lifecycle.ts", () => ({
  useRoleLifecycle: () => ({
    updateRole: mocks.updateRole,
  }),
}));

vi.mock("@/components/role-form.tsx", async (importOriginal) => {
  const actual = await importOriginal();

  return Object.assign({}, actual, {
    RoleForm: ({
      availablePermissions,
      defaultValues,
      mode,
      onCancel,
      onSubmit,
    }: {
      availablePermissions: Array<RoleFormValues["permissions"][number]>;
      defaultValues?: Partial<RoleFormValues>;
      mode: string;
      onCancel: () => void;
      onSubmit: (values: RoleFormValues) => Promise<void> | void;
    }) => (
      <div>
        <div data-testid="mode">{mode}</div>
        <div data-testid="permission-count">{availablePermissions.length}</div>
        <div data-testid="default-values">{JSON.stringify(defaultValues)}</div>
        <button type="button" onClick={onCancel}>
          cancel
        </button>
        <button type="button" onClick={() => void onSubmit(mocks.submitValues)}>
          submit
        </button>
      </div>
    ),
  });
});

vi.mock("@/context/page.tsx", () => ({
  usePageMeta: mocks.usePageMeta,
}));

function resetQueries() {
  mocks.roleQuery = {
    data: mocks.role,
    isPending: false,
    isSuccess: true,
  };
  mocks.rolesQuery = {
    data: mocks.roles,
    isPending: false,
    isSuccess: true,
  };
}

describe("EditRolePage", () => {
  beforeEach(() => {
    mocks.navigate.mockReset();
    resetQueries();
    mocks.updateRole.mockReset();
    mocks.usePageMeta.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders the loading state while the role is pending", () => {
    mocks.roleQuery = {
      isPending: true,
      isSuccess: false,
    };

    render(<EditRolePage roleId={roleId} />);

    expect(
      screen.getAllByText("Loading role details and available permissions.").length,
    ).toBeGreaterThan(0);
  });

  it("renders the loading state while roles are pending", () => {
    mocks.rolesQuery = {
      isPending: true,
      isSuccess: false,
    };

    render(<EditRolePage roleId={roleId} />);

    expect(
      screen.getAllByText("Loading role details and available permissions.").length,
    ).toBeGreaterThan(0);
  });

  it("renders the role loading error state", () => {
    mocks.roleQuery = {
      error: new Error("Role request failed"),
      isPending: false,
      isSuccess: false,
    };

    render(<EditRolePage roleId={roleId} />);

    expect(screen.getByText("Unable to load edit form")).toBeTruthy();
    expect(screen.getByText("Role request failed")).toBeTruthy();
  });

  it("renders the roles loading error state", () => {
    mocks.rolesQuery = {
      error: new Error("Roles request failed"),
      isPending: false,
      isSuccess: false,
    };

    render(<EditRolePage roleId={roleId} />);

    expect(screen.getByText("Unable to load edit form")).toBeTruthy();
    expect(screen.getByText("Roles request failed")).toBeTruthy();
  });

  it("passes default form values from the loaded role", () => {
    render(<EditRolePage roleId={roleId} />);

    expect(screen.getByTestId("mode").textContent).toBe("edit");
    expect(Number(screen.getByTestId("permission-count").textContent)).toBe(3);
    expect(JSON.parse(screen.getByTestId("default-values").textContent)).toEqual({
      name: "security-analyst",
      permissions: [
        { resource: PermissionResource.Asset, verb: PermissionVerb.Read },
        { resource: PermissionResource.Finding, verb: PermissionVerb.Read },
      ],
    });
  });

  it("updates a role through the lifecycle hook and navigates back to detail", async () => {
    mocks.updateRole.mockResolvedValueOnce({
      ...mocks.role,
      name: "security-analyst-plus",
    });

    render(<EditRolePage roleId={roleId} />);
    fireEvent.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => {
      expect(mocks.updateRole).toHaveBeenCalledWith(roleId, {
        name: "security-analyst-plus",
        permissions: [
          { resource: PermissionResource.Asset, verb: PermissionVerb.Read },
          { resource: PermissionResource.Asset, verb: PermissionVerb.Write },
        ],
      });
    });
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/roles/$id",
      params: {
        id: roleId,
      },
    });
  });

  it("does not navigate when the lifecycle handles update failures", async () => {
    mocks.updateRole.mockResolvedValueOnce(null);

    render(<EditRolePage roleId={roleId} />);
    fireEvent.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => {
      expect(mocks.updateRole).toHaveBeenCalled();
    });
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("cancels back to the role detail page", async () => {
    render(<EditRolePage roleId={roleId} />);
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    await waitFor(() => {
      expect(mocks.navigate).toHaveBeenCalledWith({
        to: "/roles/$id",
        params: {
          id: roleId,
        },
      });
    });
  });
});
