import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { FindingStatus } from "@exposurenexus/types/model/finding"
import { VulnerabilitySeverity } from "@exposurenexus/types/model/vulnerability"
import type { ReactNode } from "react"
import type { Asset, AssetType } from "@exposurenexus/types/model/asset"
import type { Finding } from "@exposurenexus/types/model/finding"
import type { UserProfile } from "@exposurenexus/types/model/user"

vi.mock("@/components/data-table/column-header.tsx", () => ({
  DataTableColumnHeader: ({ title }: { title: string }) => <span>{title}</span>
}))

vi.mock("@/components/user-label.tsx", () => ({
  formatUserProfileReference: (
    userId: string | null | undefined,
    usersById: Map<string, UserProfile>,
    {
      emptyLabel,
      unknownLabel
    }: {
      emptyLabel: string
      unknownLabel: string
    }
  ) => {
    if (!userId) return emptyLabel

    return usersById.get(userId)?.displayName ?? unknownLabel
  },
  getUserProfileDisplayName: (user: UserProfile) => user.displayName,
  UserLabel: ({
    emptyLabel,
    unknownLabel,
    user,
    userId
  }: {
    emptyLabel: string
    unknownLabel: string
    user?: UserProfile | null
    userId?: string | null
  }) => {
    if (!userId && !user) return <span>{emptyLabel}</span>
    if (user) return <span>{user.displayName}</span>
    if (typeof user === "undefined" && userId) return <span>Loading User</span>
    return <span>{unknownLabel}</span>
  }
}))

const finding: Finding = {
  id: "2713d833-eb13-4517-ac7c-7761545ed42a",
  vulnerabilityId: "9d7acdd0-fad1-46c9-8218-1793f421f0fe",
  severity: VulnerabilitySeverity.High,
  status: FindingStatus.Active,
  source: "nuclei",
  evidence: "Observed exposed admin endpoint",
  mitigation: "Restrict access to internal networks",
  assigneeId: "1fab3f6c-4b82-4a52-a5d0-59d9c33f8206",
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
    severity: VulnerabilitySeverity.High,
    description: "Administrative interface is reachable externally",
    cwe: 284,
    cve: null,
    createdBy: "1f9c36d2-1355-49d1-8464-b01ce955d88f",
    updatedBy: "1f9c36d2-1355-49d1-8464-b01ce955d88f",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z")
  }
}
const asset: Asset = {
  id: finding.assetId,
  name: "api-01",
  type: "host" as AssetType,
  ownerId: "8f5f4c3b-c369-481d-98f7-cf7148d80d21"
}
const user: UserProfile = {
  id: "8f5f4c3b-c369-481d-98f7-cf7148d80d21",
  username: "robin",
  displayName: "Robin Owner",
  email: "robin@example.com",
  enabled: false,
  roleIds: []
}
const assignee: UserProfile = {
  id: "1fab3f6c-4b82-4a52-a5d0-59d9c33f8206",
  username: "alex",
  displayName: "Alex Assignee",
  email: "alex@example.com",
  enabled: true,
  roleIds: []
}

interface RowStub {
  getValue: (columnId: string) => unknown
  original: Finding
}

interface TestColumn {
  id?: string
  accessorKey: string
  accessorFn?: (finding: Finding) => unknown
  getGroupingValue?: (finding: Finding) => unknown
  cell?: (context: { row: RowStub }) => ReactNode
  filterFn?: (
    row: RowStub,
    columnId: string,
    filterValue: Array<string>
  ) => boolean
  meta?: {
    options?: Array<{ label: string; value: string }>
  }
  sortingFn?: (rowA: RowStub, rowB: RowStub, columnId: string) => number
}

function createRow(original: Finding): RowStub {
  return {
    getValue: (columnId) => {
      if (columnId === "severity") return original.severity
      if (columnId === "status") return original.status
      if (columnId === "dueDate") return original.dueDate
      if (columnId === "firstSeen") return original.firstSeen
      if (columnId === "lastSeen") return original.lastSeen
      if (columnId === "assetId") return original.assetId
      if (columnId === "source") return original.source
      return undefined
    },
    original
  }
}

const unassignedAssigneeFilterValue = "__unassigned_assignee__"

async function createColumns(
  assetNamesById = new Map([[finding.assetId, "api-01"]]),
  assetsById = new Map([[asset.id, asset]]),
  userProfileById = new Map([
    [user.id, user],
    [assignee.id, assignee]
  ]),
  usersLoading = false
) {
  const { createFindingColumns } =
    await import("@/components/finding-table/columns.tsx")

  return createFindingColumns(
    assetNamesById,
    assetsById,
    userProfileById,
    usersLoading
  ) as unknown as Array<TestColumn>
}

function findColumn(columns: Array<TestColumn>, accessorKey: string) {
  const column = columns.find(
    (item) => item.accessorKey === accessorKey || item.id === accessorKey
  )

  if (!column) {
    throw new Error(`Missing column ${accessorKey}`)
  }

  return column
}

function renderCell(column: TestColumn, rowFinding: Finding = finding) {
  if (!column.cell) {
    throw new Error(`Column ${column.accessorKey} has no cell renderer`)
  }

  return render(<>{column.cell({ row: createRow(rowFinding) })}</>)
}

describe("createFindingColumns", () => {
  afterEach(() => {
    cleanup()
  })

  it("renders title, severity, status, asset, source, and date cells", async () => {
    const columns = await createColumns()

    renderCell(findColumn(columns, "vulnerability.title"))
    expect(screen.getByText("Exposed Admin Endpoint")).toBeTruthy()
    cleanup()

    renderCell(findColumn(columns, "severity"))
    expect(screen.getByText("High")).toBeTruthy()
    cleanup()

    renderCell(findColumn(columns, "status"))
    expect(screen.getByText("Active")).toBeTruthy()
    expect(screen.getByText("Active").className).toContain("text-red-700")
    cleanup()

    renderCell(findColumn(columns, "assetId"))
    expect(screen.getByText("api-01")).toBeTruthy()
    cleanup()

    renderCell(findColumn(columns, "responsibleOwner"))
    expect(screen.getByText("Robin Owner")).toBeTruthy()
    cleanup()

    renderCell(findColumn(columns, "assignee"))
    expect(screen.getByText("Alex Assignee")).toBeTruthy()
    cleanup()

    renderCell(findColumn(columns, "dueDate"), {
      ...finding,
      dueDate: new Date("2026-05-06T00:00:00.000Z")
    })
    expect(screen.getByText("2026-05-06")).toBeTruthy()
    cleanup()

    renderCell(findColumn(columns, "source"))
    expect(screen.getByText("nuclei")).toBeTruthy()
    cleanup()

    renderCell(findColumn(columns, "firstSeen"))
    expect(screen.getByText(finding.firstSeen.toLocaleString())).toBeTruthy()
  })

  it("renders fallback labels for unresolved assets, empty source, and missing due date", async () => {
    const columns = await createColumns(new Map(), new Map(), new Map())
    const fallbackFinding = {
      ...finding,
      dueDate: null,
      source: ""
    }

    renderCell(findColumn(columns, "assetId"), fallbackFinding)
    expect(screen.getByText("Unknown asset")).toBeTruthy()
    cleanup()

    renderCell(findColumn(columns, "responsibleOwner"), fallbackFinding)
    expect(screen.getByText("Unknown Asset")).toBeTruthy()
    cleanup()

    renderCell(findColumn(columns, "source"), fallbackFinding)
    expect(screen.getByText("Manual")).toBeTruthy()
    cleanup()

    renderCell(findColumn(columns, "dueDate"), fallbackFinding)
    expect(screen.getByText("No due date")).toBeTruthy()
  })

  it("formats due dates without shifting the UTC date key", async () => {
    const { formatFindingDueDate } =
      await import("@/components/finding-table/columns.tsx")

    expect(formatFindingDueDate(new Date("2026-05-06T23:30:00.000Z"))).toBe(
      "2026-05-06"
    )
    expect(formatFindingDueDate(null)).toBe("No due date")
  })

  it("emphasizes overdue due date cells without changing date alignment", async () => {
    const columns = await createColumns()
    const { container } = renderCell(findColumn(columns, "dueDate"), {
      ...finding,
      dueDate: new Date("2000-01-01T00:00:00.000Z")
    })

    const dueDate = screen.getByText("2000-01-01")

    expect(dueDate).toBeTruthy()
    expect(container.querySelector(".bg-destructive\\/5")).toBeTruthy()
    expect(container.querySelector(".border-destructive\\/25")).toBeNull()
  })

  it("only treats active and confirmed findings with past due dates as overdue", async () => {
    const { isFindingOverdue } =
      await import("@/components/finding-table/columns.tsx")
    const today = new Date("2026-05-06T12:00:00.000Z")
    const yesterday = new Date("2026-05-05T00:00:00.000Z")
    const dueToday = new Date("2026-05-06T00:00:00.000Z")
    const tomorrow = new Date("2026-05-07T00:00:00.000Z")

    expect(
      isFindingOverdue(
        {
          ...finding,
          status: FindingStatus.Active,
          dueDate: yesterday
        },
        today
      )
    ).toBe(true)
    expect(
      isFindingOverdue(
        {
          ...finding,
          status: FindingStatus.Confirmed,
          dueDate: yesterday
        },
        today
      )
    ).toBe(true)
    expect(
      isFindingOverdue(
        {
          ...finding,
          status: FindingStatus.Active,
          dueDate: dueToday
        },
        today
      )
    ).toBe(false)
    expect(
      isFindingOverdue(
        {
          ...finding,
          status: FindingStatus.Active,
          dueDate: tomorrow
        },
        today
      )
    ).toBe(false)

    for (const status of [
      FindingStatus.Inactive,
      FindingStatus.Mitigated,
      FindingStatus.RiskAccepted,
      FindingStatus.FalsePositive,
      FindingStatus.Duplicate,
      FindingStatus.OutOfScope
    ]) {
      expect(
        isFindingOverdue(
          {
            ...finding,
            status,
            dueDate: yesterday
          },
          today
        )
      ).toBe(false)
    }
  })

  it("renders responsible owner fallbacks for ownerless assets and unknown users", async () => {
    const ownerlessColumns = await createColumns(
      new Map([[finding.assetId, "api-01"]]),
      new Map([[asset.id, { ...asset, ownerId: null }]]),
      new Map()
    )

    renderCell(findColumn(ownerlessColumns, "responsibleOwner"))
    expect(screen.getByText("No Owner")).toBeTruthy()
    cleanup()

    const unknownOwnerColumns = await createColumns(
      new Map([[finding.assetId, "api-01"]]),
      new Map([[asset.id, asset]]),
      new Map()
    )

    renderCell(findColumn(unknownOwnerColumns, "responsibleOwner"))
    expect(screen.getByText("Unknown Owner")).toBeTruthy()
  })

  it("renders assignee fallbacks and loading state", async () => {
    const columns = await createColumns()

    renderCell(findColumn(columns, "assignee"), {
      ...finding,
      assigneeId: null
    })
    expect(screen.getByText("Unassigned")).toBeTruthy()
    cleanup()

    const unknownAssigneeColumns = await createColumns(
      new Map([[finding.assetId, "api-01"]]),
      new Map([[asset.id, asset]]),
      new Map([[user.id, user]])
    )

    renderCell(findColumn(unknownAssigneeColumns, "assignee"))
    expect(screen.getByText("Unknown Assignee")).toBeTruthy()
    cleanup()

    const loadingAssigneeColumns = await createColumns(
      new Map([[finding.assetId, "api-01"]]),
      new Map([[asset.id, asset]]),
      new Map([[user.id, user]]),
      true
    )

    renderCell(findColumn(loadingAssigneeColumns, "assignee"))
    expect(screen.getByText("Loading User")).toBeTruthy()
  })

  it("keeps assignee accessors label-based while grouping by stable identity", async () => {
    const columns = await createColumns()
    const assigneeColumn = findColumn(columns, "assignee")
    const duplicateNameAssignee: UserProfile = {
      ...assignee,
      id: "6a2bfca3-15b1-48aa-9dfd-d2cd3c15ea12",
      username: "alex-2"
    }
    const duplicateNameColumns = await createColumns(
      new Map([[finding.assetId, "api-01"]]),
      new Map([[asset.id, asset]]),
      new Map([
        [user.id, user],
        [assignee.id, assignee],
        [duplicateNameAssignee.id, duplicateNameAssignee]
      ])
    )
    const duplicateNameColumn = findColumn(duplicateNameColumns, "assignee")

    expect(assigneeColumn.accessorFn?.(finding)).toBe("Alex Assignee")
    expect(
      assigneeColumn.accessorFn?.({
        ...finding,
        assigneeId: null
      })
    ).toBe("Unassigned")
    expect(duplicateNameColumn.accessorFn?.(finding)).toBe("Alex Assignee")
    expect(
      duplicateNameColumn.accessorFn?.({
        ...finding,
        assigneeId: duplicateNameAssignee.id
      })
    ).toBe("Alex Assignee")
    expect(duplicateNameColumn.getGroupingValue?.(finding)).toBe(assignee.id)
    expect(
      duplicateNameColumn.getGroupingValue?.({
        ...finding,
        assigneeId: duplicateNameAssignee.id
      })
    ).toBe(duplicateNameAssignee.id)
    expect(
      assigneeColumn.getGroupingValue?.({
        ...finding,
        assigneeId: null
      })
    ).toBe(unassignedAssigneeFilterValue)

    const unknownAssigneeColumns = await createColumns(
      new Map([[finding.assetId, "api-01"]]),
      new Map([[asset.id, asset]]),
      new Map([[user.id, user]])
    )

    const unknownAssigneeColumn = findColumn(unknownAssigneeColumns, "assignee")
    const firstUnknownFinding = {
      ...finding,
      assigneeId: assignee.id
    }
    const secondUnknownFinding = {
      ...finding,
      assigneeId: "6a2bfca3-15b1-48aa-9dfd-d2cd3c15ea12"
    }

    expect(unknownAssigneeColumn.accessorFn?.(firstUnknownFinding)).toBe(
      "Unknown Assignee"
    )
    expect(unknownAssigneeColumn.accessorFn?.(secondUnknownFinding)).toBe(
      "Unknown Assignee"
    )
    expect(unknownAssigneeColumn.getGroupingValue?.(firstUnknownFinding)).toBe(
      assignee.id
    )
    expect(unknownAssigneeColumn.getGroupingValue?.(secondUnknownFinding)).toBe(
      secondUnknownFinding.assigneeId
    )
  })

  it("sorts severities and dates with null dates last for ascending order", async () => {
    const columns = await createColumns()
    const severityColumn = findColumn(columns, "severity")
    const firstSeenColumn = findColumn(columns, "firstSeen")
    const dueDateColumn = findColumn(columns, "dueDate")
    const criticalFinding = {
      ...finding,
      severity: VulnerabilitySeverity.Critical
    }
    const lowFinding = {
      ...finding,
      severity: VulnerabilitySeverity.Low
    }
    const laterFinding = {
      ...finding,
      firstSeen: new Date("2026-01-05T00:00:00.000Z")
    }
    const earlierDueDateFinding = {
      ...finding,
      dueDate: new Date("2026-05-06T00:00:00.000Z")
    }
    const laterDueDateFinding = {
      ...finding,
      dueDate: new Date("2026-05-07T00:00:00.000Z")
    }
    const missingDueDateFinding = {
      ...finding,
      dueDate: null
    }

    expect(
      severityColumn.sortingFn?.(
        createRow(lowFinding),
        createRow(criticalFinding),
        "severity"
      )
    ).toBeLessThan(0)
    expect(
      firstSeenColumn.sortingFn?.(
        createRow(finding),
        createRow(laterFinding),
        "firstSeen"
      )
    ).toBeLessThan(0)
    expect(
      dueDateColumn.sortingFn?.(
        createRow(earlierDueDateFinding),
        createRow(laterDueDateFinding),
        "dueDate"
      )
    ).toBeLessThan(0)
    expect(
      dueDateColumn.sortingFn?.(
        createRow(missingDueDateFinding),
        createRow(laterDueDateFinding),
        "dueDate"
      )
    ).toBeGreaterThan(0)
  })

  it("filters severity and status values", async () => {
    const columns = await createColumns()
    const row = createRow(finding)

    expect(
      findColumn(columns, "severity").filterFn?.(row, "severity", [])
    ).toBe(true)
    expect(
      findColumn(columns, "severity").filterFn?.(row, "severity", [
        VulnerabilitySeverity.High
      ])
    ).toBe(true)
    expect(
      findColumn(columns, "severity").filterFn?.(row, "severity", [
        VulnerabilitySeverity.Critical
      ])
    ).toBe(false)
    expect(
      findColumn(columns, "status").filterFn?.(row, "status", [
        FindingStatus.Active
      ])
    ).toBe(true)
    expect(
      findColumn(columns, "status").filterFn?.(row, "status", [
        FindingStatus.Mitigated
      ])
    ).toBe(false)
  })

  it("filters assignee values by user profile and unassigned state", async () => {
    const columns = await createColumns()
    const assigneeColumn = findColumn(columns, "assignee")
    const row = createRow(finding)
    const unassignedRow = createRow({
      ...finding,
      assigneeId: null
    })

    expect(assigneeColumn.filterFn?.(row, "assignee", [])).toBe(true)
    expect(assigneeColumn.filterFn?.(row, "assignee", [assignee.id])).toBe(true)
    expect(
      assigneeColumn.filterFn?.(row, "assignee", [
        "6a2bfca3-15b1-48aa-9dfd-d2cd3c15ea12"
      ])
    ).toBe(false)
    expect(
      assigneeColumn.filterFn?.(row, "assignee", [
        unassignedAssigneeFilterValue
      ])
    ).toBe(false)
    expect(
      assigneeColumn.filterFn?.(unassignedRow, "assignee", [
        unassignedAssigneeFilterValue
      ])
    ).toBe(true)
  })

  it("exposes assignee select filter options with users and unassigned", async () => {
    const columns = await createColumns()
    const assigneeColumn = findColumn(columns, "assignee")

    expect(assigneeColumn.meta?.options).toEqual(
      expect.arrayContaining([
        {
          label: "Unassigned",
          value: unassignedAssigneeFilterValue
        },
        {
          label: "Alex Assignee",
          value: assignee.id
        }
      ])
    )
  })
})
