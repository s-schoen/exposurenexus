import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AffectedResourceType } from "@exposurenexus/contracts/model/affected-resource";
import type { Finding, FindingStatus } from "@exposurenexus/contracts/model/finding";
import type { VulnerabilitySeverity } from "@exposurenexus/contracts/model/vulnerability";
import type { ReactElement, ReactNode } from "react";

const mocks = vi.hoisted(() => {
  const finding: Finding = {
    id: "2713d833-eb13-4517-ac7c-7761545ed42a",
    assetId: "447b53a7-c3ce-4a0c-b96a-099f5e5dc71c",
    title: "Exposed Admin Endpoint",
    severity: "high" as VulnerabilitySeverity,
    status: "active" as FindingStatus,
    mitigation: "Restrict access to internal networks",
    assigneeId: null,
    dueDate: null,
    weakness: { identifiers: {} },
    affectedResource: { type: "unspecified" as AffectedResourceType.Unspecified },
    vulnerabilities: [],
    observationCount: 1,
    firstSeen: new Date("2026-01-02T00:00:00.000Z"),
    lastSeen: new Date("2026-01-03T00:00:00.000Z"),
    createdBy: "1f9c36d2-1355-49d1-8464-b01ce955d88f",
    updatedBy: "1f9c36d2-1355-49d1-8464-b01ce955d88f",
    createdAt: new Date("2026-01-02T00:00:00.000Z"),
    updatedAt: new Date("2026-01-03T00:00:00.000Z"),
  };

  return {
    confirmDialogCall: vi.fn(),
    dataTableProps: undefined as undefined | Record<string, unknown>,
    deleteFindings: vi.fn(),
    finding,
    navigate: vi.fn(),
  };
});

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey: Array<string> }) => {
    if (options.queryKey.join("/") === "assets") {
      return {
        data: [
          {
            id: mocks.finding.assetId,
            displayName: "api-01",
            type: "host",
            ownerId: "8f5f4c3b-c369-481d-98f7-cf7148d80d21",
          },
        ],
        isPending: false,
        isSuccess: true,
      };
    }

    if (options.queryKey.join("/") === "users") {
      return {
        data: [
          {
            id: "8f5f4c3b-c369-481d-98f7-cf7148d80d21",
            username: "robin",
            displayName: "Robin Owner",
            email: "robin@example.com",
            enabled: false,
            roleIds: [],
          },
          {
            id: "1fab3f6c-4b82-4a52-a5d0-59d9c33f8206",
            username: "alex",
            displayName: "Alex Assignee",
            email: "alex@example.com",
            enabled: true,
            roleIds: [],
          },
        ],
        isPending: false,
        isSuccess: true,
      };
    }

    return {
      data: [mocks.finding],
      isPending: false,
      isSuccess: true,
    };
  },
}));

vi.mock("@/api/asset.ts", () => ({
  createListAssetsQueryOptions: () => ({
    queryKey: ["assets"],
  }),
}));

vi.mock("@/api/finding.ts", () => ({
  createListFindingsQueryOptions: () => ({
    queryKey: ["findings"],
  }),
}));

vi.mock("@/api/user.ts", () => ({
  createListUsersQueryOptions: () => ({
    queryKey: ["users"],
  }),
}));

vi.mock("@/components/user-label.tsx", () => ({
  createUserProfileById: (users: Array<{ displayName: string; id: string }> | undefined) =>
    new Map((users ?? []).map((user) => [user.id, user])),
  formatUserProfileReference: (
    userId: string | null | undefined,
    usersById: Map<string, { displayName: string }>,
    {
      emptyLabel = "No Owner",
      unknownLabel = "Unknown Owner",
    }: {
      emptyLabel?: string;
      unknownLabel?: string;
    } = {},
  ) => (!userId ? emptyLabel : (usersById.get(userId)?.displayName ?? unknownLabel)),
  getUserProfileDisplayName: (user: { displayName: string }) => user.displayName,
  UserLabel: ({ user }: { user?: { displayName: string } | null }) => (
    <span>{user?.displayName ?? "No Owner"}</span>
  ),
}));

vi.mock("@/hooks/use-finding-lifecycle.ts", () => ({
  useFindingLifecycle: () => ({
    deleteFindings: mocks.deleteFindings,
  }),
}));

vi.mock("@/components/confirm-dialog.tsx", () => ({
  ConfirmDialog: {
    call: mocks.confirmDialogCall,
  },
}));

vi.mock("@/components/finding-table/context-menu.tsx", () => ({
  FindingContextMenu: ({
    children,
    findings,
    onDelete,
  }: {
    children: ReactElement;
    findings: Array<Finding>;
    onDelete: () => void;
  }) => (
    <div data-finding-count={findings.length}>
      {children}
      <button type="button" onClick={onDelete}>
        context delete
      </button>
    </div>
  ),
}));

vi.mock("@/components/ui/dropdown-menu.tsx", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuTrigger: ({ render: trigger }: { render: ReactElement }) => trigger,
}));

vi.mock("@/components/data-table/data-table.tsx", () => ({
  DataTable: (props: Record<string, unknown>) => {
    mocks.dataTableProps = props;

    const contextMenu = props.contextMenu as
      | ((rows: Array<Finding>, children: ReactElement, key: string) => ReactNode)
      | undefined;
    const isRowActive = props.isRowActive as ((finding: Finding) => boolean) | undefined;
    const onFilterStateChange = props.onFilterStateChange as ((state: unknown) => void) | undefined;
    const onRowClick = props.onRowClick as ((finding: Finding) => void) | undefined;
    const onRowDelete = props.onRowDelete as
      | ((findings: Array<Finding>) => Promise<void>)
      | undefined;
    const onRowDoubleClick = props.onRowDoubleClick as ((finding: Finding) => void) | undefined;
    const toolbarControls = props.toolbarControls as
      | ((selectedRows: Array<Finding>) => ReactNode)
      | undefined;

    return (
      <div>
        <div data-testid="active-row">{String(isRowActive?.(mocks.finding))}</div>
        <div data-testid="toolbar">{toolbarControls?.([mocks.finding])}</div>
        <button type="button" onClick={() => onRowClick?.(mocks.finding)}>
          select finding
        </button>
        <button type="button" onClick={() => onRowDoubleClick?.(mocks.finding)}>
          open finding
        </button>
        <button type="button" onClick={() => void onRowDelete?.([mocks.finding])}>
          delete finding
        </button>
        <button
          type="button"
          onClick={() =>
            onFilterStateChange?.({
              globalFilter: "edge",
              selectFilters: {
                assignee: ["1fab3f6c-4b82-4a52-a5d0-59d9c33f8206"],
                severity: ["critical"],
                status: ["confirmed"],
              },
            })
          }
        >
          change filters
        </button>
        <div data-testid="context-menu">
          {contextMenu?.(
            [mocks.finding],
            <button type="button">context child</button>,
            "finding-context",
          )}
        </div>
      </div>
    );
  },
}));

async function flushPromises() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("FindingTable workflow wiring", () => {
  beforeEach(() => {
    mocks.confirmDialogCall.mockReset();
    mocks.dataTableProps = undefined;
    mocks.deleteFindings.mockReset();
    mocks.navigate.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("passes query-state filters and row handlers to DataTable", async () => {
    const { FindingTable } = await import("@/components/finding-table/index.tsx");
    const onSelectFinding = vi.fn();
    const filterState = {
      globalFilter: "admin",
      selectFilters: {
        assignee: ["__unassigned_assignee__"],
        severity: ["high"],
        status: ["active"],
      },
    };

    render(
      <FindingTable
        filterState={filterState}
        selectedFindingId={mocks.finding.id}
        onSelectFinding={onSelectFinding}
      />,
    );

    expect(screen.getByTestId("active-row").textContent).toBe("true");
    expect(mocks.dataTableProps?.filterState).toBe(filterState);
    expect(mocks.dataTableProps?.initialSorting).toEqual([{ id: "updatedAt", desc: true }]);
    expect(
      (mocks.dataTableProps?.columns as Array<{ id?: string }> | undefined)?.some(
        (column) => column.id === "responsibleOwner",
      ),
    ).toBe(true);
    expect(
      (mocks.dataTableProps?.columns as Array<{ id?: string }> | undefined)?.some(
        (column) => column.id === "assignee",
      ),
    ).toBe(true);
    expect(mocks.dataTableProps?.groupingOptions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "responsibleOwner",
          label: "Asset Owner",
        }),
        expect.objectContaining({
          id: "assignee",
          label: "Assignee",
        }),
      ]),
    );
    const assigneeGroupingOption = (
      mocks.dataTableProps?.groupingOptions as
        | Array<{
            id: string;
            formatValue?: (value: unknown) => string;
          }>
        | undefined
    )?.find((option) => option.id === "assignee");
    expect(assigneeGroupingOption?.formatValue?.("__unassigned_assignee__")).toBe("Unassigned");
    expect(assigneeGroupingOption?.formatValue?.("1fab3f6c-4b82-4a52-a5d0-59d9c33f8206")).toBe(
      "Alex Assignee",
    );
    expect(assigneeGroupingOption?.formatValue?.("6a2bfca3-15b1-48aa-9dfd-d2cd3c15ea12")).toBe(
      "Unknown Assignee",
    );
    const assigneeColumn = (
      mocks.dataTableProps?.columns as
        | Array<{
            id?: string;
            meta?: { options?: Array<{ label: string; value: string }> };
          }>
        | undefined
    )?.find((column) => column.id === "assignee");
    expect(assigneeColumn?.meta?.options).toEqual(
      expect.arrayContaining([
        {
          label: "Unassigned",
          value: "__unassigned_assignee__",
        },
        {
          label: "Alex Assignee",
          value: "1fab3f6c-4b82-4a52-a5d0-59d9c33f8206",
        },
      ]),
    );

    fireEvent.click(screen.getByRole("button", { name: /select finding/i }));
    expect(onSelectFinding).toHaveBeenCalledWith(mocks.finding);

    fireEvent.click(screen.getByRole("button", { name: /open finding/i }));
    await waitFor(() => {
      expect(mocks.navigate).toHaveBeenCalledWith({
        to: "/findings/$id",
        params: {
          id: mocks.finding.id,
        },
      });
    });
  });

  it("delegates filter changes to the route owner", async () => {
    const { FindingTable } = await import("@/components/finding-table/index.tsx");
    const onFilterStateChange = vi.fn();

    render(<FindingTable onFilterStateChange={onFilterStateChange} />);
    fireEvent.click(screen.getByRole("button", { name: /change filters/i }));

    expect(onFilterStateChange).toHaveBeenCalledWith({
      globalFilter: "edge",
      selectFilters: {
        assignee: ["1fab3f6c-4b82-4a52-a5d0-59d9c33f8206"],
        severity: ["critical"],
        status: ["confirmed"],
      },
    });
  });

  it("navigates to create finding from the toolbar", async () => {
    const { FindingTable } = await import("@/components/finding-table/index.tsx");

    render(<FindingTable />);
    fireEvent.click(screen.getByRole("button", { name: /new finding/i }));

    await waitFor(() => {
      expect(mocks.navigate).toHaveBeenCalledWith({
        to: "/findings/new",
      });
    });
  });

  it("does not delete findings when confirmation is cancelled", async () => {
    const { FindingTable } = await import("@/components/finding-table/index.tsx");
    mocks.confirmDialogCall.mockResolvedValueOnce(false);

    render(<FindingTable />);
    fireEvent.click(screen.getByRole("button", { name: /delete finding/i }));
    await flushPromises();

    expect(mocks.deleteFindings).not.toHaveBeenCalled();
  });

  it("deletes findings after confirmation from row and context menu actions", async () => {
    const { FindingTable } = await import("@/components/finding-table/index.tsx");
    mocks.confirmDialogCall.mockResolvedValue(true);

    render(<FindingTable />);
    fireEvent.click(screen.getByRole("button", { name: /delete finding/i }));
    fireEvent.click(screen.getByRole("button", { name: /context delete/i }));

    await waitFor(() => {
      expect(mocks.deleteFindings).toHaveBeenCalledTimes(2);
    });
    expect(mocks.deleteFindings).toHaveBeenCalledWith([mocks.finding]);
  });
});
