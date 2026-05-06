import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react"
import { FindingStatus } from "@openvlp/types/model/finding"
import { VulnerabilitySeverity } from "@openvlp/types/model/vulnerability"
import type { ReactElement, ReactNode, RefObject } from "react"
import type { Finding } from "@openvlp/types/model/finding"

const mocks = vi.hoisted(() => {
  const finding: Finding = {
    id: "2713d833-eb13-4517-ac7c-7761545ed42a",
    vulnerabilityId: "9d7acdd0-fad1-46c9-8218-1793f421f0fe",
    severity: "high" as VulnerabilitySeverity,
    status: "active" as FindingStatus,
    source: "manual",
    evidence: "Observed exposed admin endpoint",
    mitigation: "Restrict access to internal networks",
    assigneeId: null,
    dueDate: null,
    firstSeen: new Date("2026-01-02T00:00:00.000Z"),
    lastSeen: new Date("2026-01-03T00:00:00.000Z"),
    fingerprint: "fingerprint-1",
    assetId: "447b53a7-c3ce-4a0c-b96a-099f5e5dc71c",
    createdBy: "1f9c36d2-1355-49d1-8464-b01ce955d88f",
    updatedBy: "1f9c36d2-1355-49d1-8464-b01ce955d88f",
    createdAt: new Date("2026-01-02T00:00:00.000Z"),
    updatedAt: new Date("2026-01-03T00:00:00.000Z"),
    vulnerability: {
      id: "9d7acdd0-fad1-46c9-8218-1793f421f0fe",
      title: "Exposed Admin Endpoint",
      severity: "high" as VulnerabilitySeverity,
      description: "Administrative interface is reachable externally",
      cwe: 284,
      cve: null,
      createdBy: "1f9c36d2-1355-49d1-8464-b01ce955d88f",
      updatedBy: "1f9c36d2-1355-49d1-8464-b01ce955d88f",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z")
    }
  }

  return {
    bulkUpdateFindingField: vi.fn(),
    confirmDialogCall: vi.fn(),
    dataTableProps: undefined as undefined | Record<string, unknown>,
    deleteFindings: vi.fn(),
    finding,
    navigate: vi.fn(),
    queryStates: {
      assignee: ["__unassigned_assignee__"],
      filter: "admin",
      severity: ["high"],
      status: ["active"]
    } as Record<string, string | Array<string> | null>,
    setAssigneeFilter: vi.fn(),
    setFilter: vi.fn(),
    setSeverityFilter: vi.fn(),
    setStatusFilter: vi.fn()
  }
})

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate
}))

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey: Array<string> }) => {
    if (options.queryKey.join("/") === "assets") {
      return {
        data: [
          {
            id: mocks.finding.assetId,
            name: "api-01",
            type: "host",
            ownerId: "8f5f4c3b-c369-481d-98f7-cf7148d80d21"
          }
        ],
        isPending: false,
        isSuccess: true
      }
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
            roleIds: []
          },
          {
            id: "1fab3f6c-4b82-4a52-a5d0-59d9c33f8206",
            username: "alex",
            displayName: "Alex Assignee",
            email: "alex@example.com",
            enabled: true,
            roleIds: []
          }
        ],
        isPending: false,
        isSuccess: true
      }
    }

    return {
      data: [mocks.finding],
      isPending: false,
      isSuccess: true
    }
  }
}))

vi.mock("nuqs", () => ({
  parseAsArrayOf: () => ({
    withDefault: () => ({})
  }),
  parseAsString: {},
  useQueryState: (key: string) => {
    if (key === "filter") {
      return [mocks.queryStates.filter, mocks.setFilter]
    }

    if (key === "severity") {
      return [mocks.queryStates.severity, mocks.setSeverityFilter]
    }

    if (key === "status") {
      return [mocks.queryStates.status, mocks.setStatusFilter]
    }

    return [mocks.queryStates.assignee, mocks.setAssigneeFilter]
  }
}))

vi.mock("@/api/asset.ts", () => ({
  createListAssetsQueryOptions: () => ({
    queryKey: ["assets"]
  })
}))

vi.mock("@/api/finding.ts", () => ({
  createListFindingsQueryOptions: () => ({
    queryKey: ["findings"]
  })
}))

vi.mock("@/api/user.ts", () => ({
  createListUsersQueryOptions: () => ({
    queryKey: ["users"]
  })
}))

vi.mock("@/components/user-label.tsx", () => ({
  createUserProfileById: (
    users: Array<{ displayName: string; id: string }> | undefined
  ) => new Map((users ?? []).map((user) => [user.id, user])),
  formatUserProfileReference: (
    userId: string | null | undefined,
    usersById: Map<string, { displayName: string }>,
    {
      emptyLabel = "No Owner",
      unknownLabel = "Unknown Owner"
    }: {
      emptyLabel?: string
      unknownLabel?: string
    } = {}
  ) =>
    !userId
      ? emptyLabel
      : (usersById.get(userId)?.displayName ?? unknownLabel),
  getUserProfileDisplayName: (user: { displayName: string }) =>
    user.displayName,
  UserLabel: ({ user }: { user?: { displayName: string } | null }) => (
    <span>{user?.displayName ?? "No Owner"}</span>
  )
}))

vi.mock("@/hooks/use-finding-lifecycle.ts", () => ({
  useFindingLifecycle: () => ({
    bulkUpdateFindingField: mocks.bulkUpdateFindingField,
    deleteFindings: mocks.deleteFindings
  })
}))

vi.mock("@/components/confirm-dialog.tsx", () => ({
  ConfirmDialog: {
    call: mocks.confirmDialogCall
  }
}))

vi.mock("@/components/finding-table/context-menu.tsx", () => ({
  FindingContextMenu: ({
    children,
    onDelete
  }: {
    children: ReactElement
    onDelete: () => void
  }) => (
    <div>
      {children}
      <button type="button" onClick={onDelete}>
        context delete
      </button>
    </div>
  )
}))

vi.mock("@/components/ui/dropdown-menu.tsx", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    onClick
  }: {
    children: ReactNode
    onClick?: () => void
  }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuTrigger: ({ render: trigger }: { render: ReactElement }) =>
    trigger
}))

vi.mock("@/components/data-table/data-table.tsx", () => ({
  DataTable: (props: Record<string, unknown>) => {
    mocks.dataTableProps = props

    const contextMenu = props.contextMenu as
      | ((
          rowsRef: RefObject<Array<Finding>>,
          children: ReactElement,
          key: string
        ) => ReactNode)
      | undefined
    const isRowActive = props.isRowActive as
      | ((finding: Finding) => boolean)
      | undefined
    const onFilterStateChange = props.onFilterStateChange as
      | ((state: unknown) => void)
      | undefined
    const onRowClick = props.onRowClick as
      | ((finding: Finding) => void)
      | undefined
    const onRowDelete = props.onRowDelete as
      | ((findings: Array<Finding>) => Promise<void>)
      | undefined
    const onRowDoubleClick = props.onRowDoubleClick as
      | ((finding: Finding) => void)
      | undefined
    const toolbarControls = props.toolbarControls as
      | ((selectedRows: Array<Finding>) => ReactNode)
      | undefined

    return (
      <div>
        <div data-testid="active-row">
          {String(isRowActive?.(mocks.finding))}
        </div>
        <div data-testid="toolbar">{toolbarControls?.([mocks.finding])}</div>
        <button type="button" onClick={() => onRowClick?.(mocks.finding)}>
          select finding
        </button>
        <button type="button" onClick={() => onRowDoubleClick?.(mocks.finding)}>
          open finding
        </button>
        <button
          type="button"
          onClick={() => void onRowDelete?.([mocks.finding])}
        >
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
                status: ["confirmed"]
              }
            })
          }
        >
          change filters
        </button>
        <div data-testid="context-menu">
          {contextMenu?.(
            { current: [mocks.finding] },
            <button type="button">context child</button>,
            "finding-context"
          )}
        </div>
      </div>
    )
  }
}))

async function flushPromises() {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe("FindingTable workflow wiring", () => {
  beforeEach(() => {
    mocks.bulkUpdateFindingField.mockReset()
    mocks.confirmDialogCall.mockReset()
    mocks.dataTableProps = undefined
    mocks.deleteFindings.mockReset()
    mocks.navigate.mockReset()
    mocks.queryStates = {
      assignee: ["__unassigned_assignee__"],
      filter: "admin",
      severity: ["high"],
      status: ["active"]
    }
    mocks.setAssigneeFilter.mockReset()
    mocks.setFilter.mockReset()
    mocks.setSeverityFilter.mockReset()
    mocks.setStatusFilter.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it("passes query-state filters and row handlers to DataTable", async () => {
    const { FindingTable } =
      await import("@/components/finding-table/index.tsx")
    const onSelectFinding = vi.fn()

    render(
      <FindingTable
        selectedFindingId={mocks.finding.id}
        onSelectFinding={onSelectFinding}
      />
    )

    expect(screen.getByTestId("active-row").textContent).toBe("true")
    expect(mocks.dataTableProps?.filterState).toEqual({
      globalFilter: "admin",
      selectFilters: {
        assignee: ["__unassigned_assignee__"],
        severity: ["high"],
        status: ["active"]
      }
    })
    expect(mocks.dataTableProps?.initialSorting).toEqual([
      { id: "severity", desc: true },
      { id: "lastSeen", desc: true }
    ])
    expect(
      (mocks.dataTableProps?.columns as Array<{ id?: string }>).some(
        (column) => column.id === "responsibleOwner"
      )
    ).toBe(true)
    expect(
      (mocks.dataTableProps?.columns as Array<{ id?: string }>).some(
        (column) => column.id === "assignee"
      )
    ).toBe(true)
    expect(mocks.dataTableProps?.groupingOptions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "responsibleOwner",
          label: "Responsible Owner"
        }),
        expect.objectContaining({
          id: "assignee",
          label: "Assignee"
        })
      ])
    )
    const assigneeGroupingOption = (
      mocks.dataTableProps?.groupingOptions as Array<{
        id: string
        formatValue?: (value: unknown) => string
      }>
    ).find((option) => option.id === "assignee")
    expect(assigneeGroupingOption?.formatValue?.("__unassigned_assignee__")).toBe(
      "Unassigned"
    )
    expect(
      assigneeGroupingOption?.formatValue?.(
        "1fab3f6c-4b82-4a52-a5d0-59d9c33f8206"
      )
    ).toBe("Alex Assignee")
    expect(
      assigneeGroupingOption?.formatValue?.(
        "6a2bfca3-15b1-48aa-9dfd-d2cd3c15ea12"
      )
    ).toBe("Unknown Assignee")
    const assigneeColumn = (
      mocks.dataTableProps?.columns as Array<{
        id?: string
        meta?: { options?: Array<{ label: string; value: string }> }
      }>
    ).find((column) => column.id === "assignee")
    expect(assigneeColumn?.meta?.options).toEqual(
      expect.arrayContaining([
        {
          label: "Unassigned",
          value: "__unassigned_assignee__"
        },
        {
          label: "Alex Assignee",
          value: "1fab3f6c-4b82-4a52-a5d0-59d9c33f8206"
        }
      ])
    )

    fireEvent.click(screen.getByRole("button", { name: /select finding/i }))
    expect(onSelectFinding).toHaveBeenCalledWith(mocks.finding)

    fireEvent.click(screen.getByRole("button", { name: /open finding/i }))
    await waitFor(() => {
      expect(mocks.navigate).toHaveBeenCalledWith({
        to: "/findings/$id",
        params: {
          id: mocks.finding.id
        }
      })
    })
  })

  it("syncs table filter changes back to query state", async () => {
    const { FindingTable } =
      await import("@/components/finding-table/index.tsx")

    render(<FindingTable />)
    fireEvent.click(screen.getByRole("button", { name: /change filters/i }))

    expect(mocks.setFilter).toHaveBeenCalledWith("edge")
    expect(mocks.setSeverityFilter).toHaveBeenCalledWith(["critical"])
    expect(mocks.setStatusFilter).toHaveBeenCalledWith(["confirmed"])
    expect(mocks.setAssigneeFilter).toHaveBeenCalledWith([
      "1fab3f6c-4b82-4a52-a5d0-59d9c33f8206"
    ])
  })

  it("navigates to create finding from the toolbar", async () => {
    const { FindingTable } =
      await import("@/components/finding-table/index.tsx")

    render(<FindingTable />)
    fireEvent.click(screen.getByRole("button", { name: /new finding/i }))

    await waitFor(() => {
      expect(mocks.navigate).toHaveBeenCalledWith({
        to: "/findings/new"
      })
    })
  })

  it("runs bulk status and severity updates from the toolbar", async () => {
    const { FindingTable } =
      await import("@/components/finding-table/index.tsx")

    render(<FindingTable />)
    fireEvent.click(screen.getByRole("button", { name: /^confirmed$/i }))
    fireEvent.click(screen.getByRole("button", { name: /^critical$/i }))

    expect(mocks.bulkUpdateFindingField).toHaveBeenCalledWith(
      [mocks.finding],
      "status",
      FindingStatus.Confirmed
    )
    expect(mocks.bulkUpdateFindingField).toHaveBeenCalledWith(
      [mocks.finding],
      "severity",
      VulnerabilitySeverity.Critical
    )
  })

  it("does not delete findings when confirmation is cancelled", async () => {
    const { FindingTable } =
      await import("@/components/finding-table/index.tsx")
    mocks.confirmDialogCall.mockResolvedValueOnce(false)

    render(<FindingTable />)
    fireEvent.click(screen.getByRole("button", { name: /delete finding/i }))
    await flushPromises()

    expect(mocks.deleteFindings).not.toHaveBeenCalled()
  })

  it("deletes findings after confirmation from row and context menu actions", async () => {
    const { FindingTable } =
      await import("@/components/finding-table/index.tsx")
    mocks.confirmDialogCall.mockResolvedValue(true)

    render(<FindingTable />)
    fireEvent.click(screen.getByRole("button", { name: /delete finding/i }))
    fireEvent.click(screen.getByRole("button", { name: /context delete/i }))

    await waitFor(() => {
      expect(mocks.deleteFindings).toHaveBeenCalledTimes(2)
    })
    expect(mocks.deleteFindings).toHaveBeenCalledWith([mocks.finding])
  })
})
