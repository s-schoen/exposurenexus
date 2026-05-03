import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { FindingStatus } from "@openvlp/types/model/finding"
import { VulnerabilitySeverity } from "@openvlp/types/model/vulnerability"
import type { ReactNode } from "react"
import type { Asset, AssetType } from "@openvlp/types/model/asset"
import type { Finding } from "@openvlp/types/model/finding"
import type { UserProfile } from "@openvlp/types/model/user"

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

interface RowStub {
  getValue: (columnId: string) => unknown
  original: Finding
}

interface TestColumn {
  id?: string
  accessorKey: string
  accessorFn?: (finding: Finding) => unknown
  cell?: (context: { row: RowStub }) => ReactNode
  filterFn?: (
    row: RowStub,
    columnId: string,
    filterValue: Array<string>
  ) => boolean
  sortingFn?: (rowA: RowStub, rowB: RowStub, columnId: string) => number
}

function createRow(original: Finding): RowStub {
  return {
    getValue: (columnId) => {
      if (columnId === "severity") return original.severity
      if (columnId === "status") return original.status
      if (columnId === "firstSeen") return original.firstSeen
      if (columnId === "lastSeen") return original.lastSeen
      if (columnId === "assetId") return original.assetId
      if (columnId === "source") return original.source
      return undefined
    },
    original
  }
}

async function createColumns(
  assetNamesById = new Map([[finding.assetId, "api-01"]]),
  assetsById = new Map([[asset.id, asset]]),
  userProfileById = new Map([[user.id, user]])
) {
  const { createFindingColumns } =
    await import("@/components/finding-table/columns.tsx")

  return createFindingColumns(
    assetNamesById,
    assetsById,
    userProfileById
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
    cleanup()

    renderCell(findColumn(columns, "assetId"))
    expect(screen.getByText("api-01")).toBeTruthy()
    cleanup()

    renderCell(findColumn(columns, "responsibleOwner"))
    expect(screen.getByText("Robin Owner")).toBeTruthy()
    cleanup()

    renderCell(findColumn(columns, "source"))
    expect(screen.getByText("nuclei")).toBeTruthy()
    cleanup()

    renderCell(findColumn(columns, "firstSeen"))
    expect(screen.getByText(finding.firstSeen!.toLocaleString())).toBeTruthy()
  })

  it("renders fallback labels for unresolved assets, empty source, and missing dates", async () => {
    const columns = await createColumns(new Map(), new Map(), new Map())
    const fallbackFinding = {
      ...finding,
      firstSeen: null,
      lastSeen: null,
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

    renderCell(findColumn(columns, "lastSeen"), fallbackFinding)
    expect(screen.getByText("Not available")).toBeTruthy()
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

  it("sorts severities and dates with null dates last for ascending order", async () => {
    const columns = await createColumns()
    const severityColumn = findColumn(columns, "severity")
    const firstSeenColumn = findColumn(columns, "firstSeen")
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
    const missingDateFinding = {
      ...finding,
      firstSeen: null
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
        createRow(missingDateFinding),
        createRow(laterFinding),
        "firstSeen"
      )
    ).toBeLessThan(0)
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
})
