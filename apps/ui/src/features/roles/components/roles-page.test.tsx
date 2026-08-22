import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Role } from "@exposurenexus/contracts/model/rbac";
import type { ReactNode } from "react";

const mocks = vi.hoisted(() => {
  const builtInRole = {
    id: "6d0d8a47-0f6d-47b6-9b9a-d8f0d3f4dd01",
    name: "viewer",
    permissions: [],
  };
  const customRole = {
    id: "8f74bc56-0ac3-47ef-b7e6-8df2c42fb3c0",
    name: "security-auditor",
    permissions: [],
  };
  const failingRole = {
    id: "d4db4a45-9082-4280-9a55-4316963822f7",
    name: "failing-role",
    permissions: [],
  };

  return {
    builtInRole,
    confirmDialogCall: vi.fn(),
    customRole,
    deleteRoles: vi.fn(),
    dialogProps: undefined as undefined | Record<string, unknown>,
    failingRole,
    navigate: vi.fn(),
    toastError: vi.fn(),
    usePageMeta: vi.fn(),
    useQuery: vi.fn(),
  };
});

vi.mock("@tanstack/react-query", () => ({
  useQuery: mocks.useQuery,
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock("sonner", () => ({
  toast: {
    error: mocks.toastError,
  },
}));

vi.mock("@/api/role.ts", () => ({
  createListRolesQueryOptions: () => ({
    queryKey: ["roles"],
  }),
}));

vi.mock("@/hooks/use-role-lifecycle.ts", () => ({
  useRoleLifecycle: () => ({
    deleteRoles: mocks.deleteRoles,
  }),
}));

vi.mock("@/components/confirm-dialog.tsx", () => ({
  ConfirmDialog: {
    call: mocks.confirmDialogCall,
  },
}));

vi.mock("@/components/detail-preview-dialog.tsx", () => ({
  DetailPreviewDialog: (props: {
    children?: ReactNode;
    description: string;
    fullPageHref?: string;
    onClose: () => void;
    selectedId?: string;
    title: string;
  }) => {
    mocks.dialogProps = props;

    return (
      <section>
        <h2>{props.title}</h2>
        <p>{props.description}</p>
        <div data-testid="selected-role">{props.selectedId}</div>
        <div data-testid="full-page-href">{props.fullPageHref}</div>
        <button type="button" onClick={props.onClose}>
          close dialog
        </button>
        {props.children}
      </section>
    );
  },
}));

vi.mock("@/components/role-detail-content.tsx", () => ({
  RoleDetailContent: ({ roleId }: { roleId: string }) => <div>Detail for role {roleId}</div>,
}));

vi.mock("@/components/role-table", () => ({
  RoleTable: ({
    filterState,
    onCreateRole,
    onDeleteRoles,
    onFilterStateChange,
    onOpenRole,
    onSelectRole,
    selectedRoleId,
  }: {
    filterState?: unknown;
    onCreateRole?: () => void;
    onDeleteRoles?: (roles: Array<Role>) => Promise<void>;
    onFilterStateChange?: (filterState: {
      globalFilter: string;
      selectFilters: Record<string, Array<string>>;
    }) => void;
    onOpenRole?: (role: Role) => void;
    onSelectRole?: (role: Role) => void;
    selectedRoleId?: string;
  }) => (
    <div>
      <div data-testid="table-selected-role">{selectedRoleId}</div>
      <div data-testid="filter-state">{JSON.stringify(filterState)}</div>
      <button type="button" onClick={() => onSelectRole?.(mocks.customRole)}>
        select role
      </button>
      <button type="button" onClick={() => onOpenRole?.(mocks.customRole)}>
        open role
      </button>
      <button type="button" onClick={onCreateRole}>
        New role
      </button>
      <button
        type="button"
        onClick={() => {
          void onDeleteRoles?.([mocks.builtInRole]);
        }}
      >
        delete built-in
      </button>
      <button
        type="button"
        onClick={() => {
          void onDeleteRoles?.([mocks.builtInRole, mocks.customRole]);
        }}
      >
        delete mixed
      </button>
      <button
        type="button"
        onClick={() => {
          void onDeleteRoles?.([mocks.failingRole]);
        }}
      >
        delete failing
      </button>
      <button
        type="button"
        onClick={() =>
          onFilterStateChange?.({
            globalFilter: "security",
            selectFilters: {
              kind: ["custom"],
            },
          })
        }
      >
        change filters
      </button>
    </div>
  ),
}));

vi.mock("@/context/page.tsx", () => ({
  usePageMeta: mocks.usePageMeta,
}));

describe("RolesPage", () => {
  beforeEach(() => {
    mocks.confirmDialogCall.mockReset();
    mocks.confirmDialogCall.mockResolvedValue(true);
    mocks.deleteRoles.mockReset();
    mocks.deleteRoles.mockResolvedValue({
      successful: [mocks.customRole],
      failed: [],
    });
    mocks.dialogProps = undefined;
    mocks.navigate.mockReset();
    mocks.toastError.mockReset();
    mocks.usePageMeta.mockReset();
    mocks.useQuery.mockReset();
    mocks.useQuery.mockReturnValue({
      data: [mocks.builtInRole, mocks.customRole],
      isFetching: false,
      isPending: false,
      refetch: vi.fn(),
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("navigates to the create route from the table toolbar", async () => {
    const { RolesPage } = await import("@/features/roles/components/roles-page.tsx");

    render(<RolesPage />);

    fireEvent.click(screen.getByRole("button", { name: /^new role$/i }));

    expect(mocks.navigate).toHaveBeenCalledWith({ to: "/roles/new" });
  });

  it("passes route-owned filters and selected preview metadata to the table", async () => {
    const { RolesPage } = await import("@/features/roles/components/roles-page.tsx");

    render(
      <RolesPage
        search={{ filter: "security", kind: "built-in,custom" }}
        selected={mocks.customRole.id}
      />,
    );

    expect(JSON.parse(screen.getByTestId("filter-state").textContent)).toEqual({
      globalFilter: "security",
      selectFilters: {
        kind: ["built-in", "custom"],
      },
    });
    expect(screen.getByTestId("table-selected-role").textContent).toBe(mocks.customRole.id);
    expect(screen.getByTestId("selected-role").textContent).toBe(mocks.customRole.id);
    expect(screen.getByTestId("full-page-href").textContent).toBe(`/roles/${mocks.customRole.id}`);
    expect(screen.getByText(`Detail for role ${mocks.customRole.id}`)).toBeTruthy();
  });

  it("updates route-owned filters and preserves unrelated search params", async () => {
    const { RolesPage } = await import("@/features/roles/components/roles-page.tsx");

    render(<RolesPage />);
    fireEvent.click(screen.getByRole("button", { name: /change filters/i }));

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/roles",
      replace: true,
      search: expect.any(Function),
    });

    const search = mocks.navigate.mock.calls[0][0].search as (
      previous: Record<string, unknown>,
    ) => Record<string, unknown>;

    expect(search({ page: "2", selected: "role-1" })).toEqual({
      filter: "security",
      kind: "custom",
      page: "2",
      selected: "role-1",
    });
  });

  it("selects and opens roles from the table", async () => {
    const { RolesPage } = await import("@/features/roles/components/roles-page.tsx");

    render(<RolesPage />);
    fireEvent.click(screen.getByRole("button", { name: /select role/i }));

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/roles",
      replace: true,
      search: expect.any(Function),
    });

    const selectSearch = mocks.navigate.mock.calls[0][0].search as (
      previous: Record<string, unknown>,
    ) => Record<string, unknown>;

    expect(selectSearch({ filter: "security", kind: "custom" })).toEqual({
      filter: "security",
      kind: "custom",
      selected: mocks.customRole.id,
    });

    fireEvent.click(screen.getByRole("button", { name: /open role/i }));

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/roles/$id",
      params: {
        id: mocks.customRole.id,
      },
    });
  });

  it("skips built-in-only delete selections without calling the API", async () => {
    const { RolesPage } = await import("@/features/roles/components/roles-page.tsx");

    render(<RolesPage />);

    fireEvent.click(screen.getByRole("button", { name: /delete built-in/i }));

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith("Built-in roles cannot be deleted");
    });
    expect(mocks.confirmDialogCall).not.toHaveBeenCalled();
    expect(mocks.deleteRoles).not.toHaveBeenCalled();
  });

  it("confirms mixed selections and deletes only custom roles", async () => {
    const { RolesPage } = await import("@/features/roles/components/roles-page.tsx");

    render(<RolesPage />);

    fireEvent.click(screen.getByRole("button", { name: /delete mixed/i }));

    await waitFor(() => {
      expect(mocks.deleteRoles).toHaveBeenCalledWith([mocks.customRole]);
    });
    expect(mocks.deleteRoles).not.toHaveBeenCalledWith([mocks.builtInRole]);
  });

  it("leaves the preview open when the lifecycle reports a delete failure", async () => {
    const failure = new Error("request failed");
    mocks.deleteRoles.mockResolvedValueOnce({
      successful: [],
      failed: [
        {
          role: mocks.failingRole,
          error: failure,
        },
      ],
    });
    const { RolesPage } = await import("@/features/roles/components/roles-page.tsx");

    render(<RolesPage selected={mocks.failingRole.id} />);

    fireEvent.click(screen.getByRole("button", { name: /delete failing/i }));

    await waitFor(() => {
      expect(mocks.deleteRoles).toHaveBeenCalledWith([mocks.failingRole]);
    });
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("closes the selected role preview after deleting that role", async () => {
    const { RolesPage } = await import("@/features/roles/components/roles-page.tsx");

    render(<RolesPage selected={mocks.customRole.id} />);

    fireEvent.click(screen.getByRole("button", { name: /delete mixed/i }));

    await waitFor(() => {
      expect(mocks.navigate).toHaveBeenCalledWith({
        to: "/roles",
        replace: true,
        search: expect.any(Function),
      });
    });

    const clearSearch = mocks.navigate.mock.calls[0][0].search as (
      previous: Record<string, unknown>,
    ) => Record<string, unknown>;

    expect(
      clearSearch({
        filter: "security",
        kind: "custom",
        selected: mocks.customRole.id,
      }),
    ).toEqual({
      filter: "security",
      kind: "custom",
      selected: undefined,
    });
  });
});
