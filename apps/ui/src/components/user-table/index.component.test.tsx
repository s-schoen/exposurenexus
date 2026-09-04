import { builtInRoleIds } from "@exposurenexus/contracts/model/rbac";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Role } from "@exposurenexus/contracts/model/rbac";
import type { UserProfile } from "@exposurenexus/contracts/model/user";
import type { ReactNode } from "react";

const mocks = vi.hoisted(() => {
  const user: UserProfile = {
    id: "1f9c36d2-1355-49d1-8464-b01ce955d88f",
    username: "alice",
    displayName: "Alice Example",
    email: "alice@example.com",
    enabled: true,
    roleIds: ["6d0d8a47-0f6d-47b6-9b9a-d8f0d3f4dd01"],
  };

  const roles: Array<Role> = [
    {
      id: "6d0d8a47-0f6d-47b6-9b9a-d8f0d3f4dd01",
      name: "viewer",
      permissions: [],
    },
    {
      id: "5d5f5c6f-a9d6-4d49-9f4d-9462b873a902",
      name: "editor",
      permissions: [],
    },
    {
      id: "0e7b7e25-47f2-4baf-a2c1-6ec48b0d8b03",
      name: "admin",
      permissions: [],
    },
  ];
  return {
    dataTableProps: undefined as undefined | Record<string, unknown>,
    navigate: vi.fn(),
    roles,
    rolesQuery: {
      data: roles,
      isPending: false,
      isSuccess: true,
    },
    user,
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

    return {
      data: [mocks.user],
      isPending: false,
      isSuccess: true,
    };
  },
}));

vi.mock("@/features/roles", () => ({
  createListRolesQueryOptions: () => ({
    queryKey: ["roles"],
  }),
}));

vi.mock("@/api/user.ts", () => ({
  createListUsersQueryOptions: () => ({
    queryKey: ["users"],
  }),
}));

vi.mock("@/components/data-table/data-table.tsx", () => ({
  DataTable: (props: Record<string, unknown>) => {
    mocks.dataTableProps = props;

    const isRowActive = props.isRowActive as ((user: UserProfile) => boolean) | undefined;
    const onFilterStateChange = props.onFilterStateChange as ((state: unknown) => void) | undefined;
    const onRowClick = props.onRowClick as ((user: UserProfile) => void) | undefined;
    const onRowDoubleClick = props.onRowDoubleClick as ((user: UserProfile) => void) | undefined;
    const toolbarControls = props.toolbarControls as ReactNode;

    return (
      <div>
        <div data-testid="active-row">{String(isRowActive?.(mocks.user))}</div>
        <div data-testid="toolbar">{toolbarControls}</div>
        <button type="button" onClick={() => onRowClick?.(mocks.user)}>
          select user
        </button>
        <button type="button" onClick={() => onRowDoubleClick?.(mocks.user)}>
          open user
        </button>
        <button
          type="button"
          onClick={() =>
            onFilterStateChange?.({
              globalFilter: "bob",
              selectFilters: {
                enabled: ["false"],
              },
            })
          }
        >
          change filters
        </button>
        <button
          type="button"
          onClick={() =>
            onFilterStateChange?.({
              globalFilter: "",
              selectFilters: {},
            })
          }
        >
          clear filters
        </button>
      </div>
    );
  },
}));

function renderCell(cell: unknown, user: UserProfile) {
  if (typeof cell !== "function") {
    throw new Error("Expected a cell renderer");
  }

  return render(<>{cell({ row: { original: user } })}</>);
}

describe("UserTable workflow wiring", () => {
  beforeEach(() => {
    mocks.dataTableProps = undefined;
    mocks.navigate.mockReset();
    mocks.rolesQuery = {
      data: mocks.roles,
      isPending: false,
      isSuccess: true,
    };
  });

  afterEach(() => {
    cleanup();
  });

  it("passes route-owned filters, active row state, and row handlers to DataTable", async () => {
    const { UserTable } = await import("@/components/user-table/index.tsx");
    const onSelectUser = vi.fn();
    const filterState = {
      globalFilter: "alice",
      selectFilters: {
        enabled: ["true"],
      },
    };

    render(
      <UserTable
        filterState={filterState}
        selectedUserId={mocks.user.id}
        onSelectUser={onSelectUser}
      />,
    );

    expect(screen.getByTestId("active-row").textContent).toBe("true");
    expect(mocks.dataTableProps?.filterState).toEqual(filterState);
    expect(mocks.dataTableProps?.onRowDelete).toBeUndefined();

    fireEvent.click(screen.getByRole("button", { name: /select user/i }));
    expect(onSelectUser).toHaveBeenCalledWith(mocks.user);

    fireEvent.click(screen.getByRole("button", { name: /open user/i }));
    await waitFor(() => {
      expect(mocks.navigate).toHaveBeenCalledWith({
        to: "/users/$id",
        params: {
          id: mocks.user.id,
        },
      });
    });
  });

  it("forwards table filter changes", async () => {
    const { UserTable } = await import("@/components/user-table/index.tsx");
    const onFilterStateChange = vi.fn();

    render(<UserTable onFilterStateChange={onFilterStateChange} />);
    fireEvent.click(screen.getByRole("button", { name: /change filters/i }));

    expect(onFilterStateChange).toHaveBeenCalledWith({
      globalFilter: "bob",
      selectFilters: {
        enabled: ["false"],
      },
    });

    fireEvent.click(screen.getByRole("button", { name: /clear filters/i }));

    expect(onFilterStateChange).toHaveBeenCalledWith({
      globalFilter: "",
      selectFilters: {},
    });
  });

  it("renders the create-user toolbar action when provided", async () => {
    const { UserTable } = await import("@/components/user-table/index.tsx");
    const onCreateUser = vi.fn();

    render(<UserTable onCreateUser={onCreateUser} />);
    fireEvent.click(screen.getByRole("button", { name: /new user/i }));

    expect(onCreateUser).toHaveBeenCalledTimes(1);
  });

  it("does not create filter state without route-owned filters", async () => {
    const { UserTable } = await import("@/components/user-table/index.tsx");

    render(<UserTable />);

    expect(mocks.dataTableProps?.filterState).toBeUndefined();
  });
});

describe("user table role columns", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders unresolved role counts while role data is unavailable", async () => {
    const { createColumns } = await import("@/components/user-table/columns.tsx");
    const rolesColumn = createColumns(new Map(), false).find(
      (column) => "id" in column && column.id === "roles",
    );

    renderCell(rolesColumn?.cell, {
      ...mocks.user,
      roleIds: [builtInRoleIds.viewer, builtInRoleIds.editor],
    });

    expect(screen.getByText("2 roles")).toBeTruthy();
  });

  it("renders resolved role labels, unknown counts, and empty roles", async () => {
    const { createColumns } = await import("@/components/user-table/columns.tsx");
    const rolesColumn = createColumns(
      new Map([
        [builtInRoleIds.viewer, "viewer"],
        [builtInRoleIds.editor, "editor"],
      ]),
      true,
    ).find((column) => "id" in column && column.id === "roles");

    const unknownRoleId = "a1ed0f1c-28af-40f4-b08e-9fe9ab4a3223";
    const { rerender } = renderCell(rolesColumn?.cell, {
      ...mocks.user,
      roleIds: [builtInRoleIds.viewer, builtInRoleIds.editor, unknownRoleId],
    });

    expect(screen.getByText("viewer")).toBeTruthy();
    expect(screen.getByText("editor")).toBeTruthy();
    expect(screen.getByText("+1 unknown")).toBeTruthy();

    if (typeof rolesColumn?.cell !== "function") {
      throw new Error("Expected a cell renderer");
    }

    rerender(
      <>
        {rolesColumn.cell({
          row: {
            original: {
              ...mocks.user,
              roleIds: [],
            },
          },
        } as never)}
      </>,
    );

    expect(screen.getByText("No roles")).toBeTruthy();
  });

  it("filters enabled rows from string filter values", async () => {
    const { createColumns } = await import("@/components/user-table/columns.tsx");
    const enabledColumn = createColumns(new Map(), false).find(
      (column) => "accessorKey" in column && column.accessorKey === "enabled",
    );
    const filterFn = enabledColumn?.filterFn;

    if (typeof filterFn !== "function") {
      throw new Error("Expected a filter function");
    }

    const enabledRow = {
      getValue: () => true,
    };
    const disabledRow = {
      getValue: () => false,
    };

    expect(filterFn(enabledRow as never, "enabled", [], () => undefined)).toBe(true);
    expect(filterFn(enabledRow as never, "enabled", ["true"], () => undefined)).toBe(true);
    expect(filterFn(disabledRow as never, "enabled", ["true"], () => undefined)).toBe(false);
  });
});
