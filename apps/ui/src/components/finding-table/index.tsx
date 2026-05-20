import { Check, Layers3, Plus } from "lucide-react"
import { useNavigate } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { parseAsArrayOf, parseAsString, useQueryState } from "nuqs"
import { useMemo } from "react"
import type { Finding } from "@exposurenexus/types/model/finding"
import type {
  DataTableFilterState,
  GroupingOption
} from "@/components/data-table/types.ts"
import { DataTable } from "@/components/data-table/data-table.tsx"
import {
  FINDING_ASSIGNEE_UNASSIGNED_FILTER_VALUE,
  createFindingColumns,
  formatFindingAssignee
} from "@/components/finding-table/columns.tsx"
import {
  SEVERITY_ORDER,
  STATUS_ORDER
} from "@/components/finding-table/constants.ts"
import { FindingContextMenu } from "@/components/finding-table/context-menu.tsx"
import { Button } from "@/components/ui/button.tsx"
import { ConfirmDialog } from "@/components/confirm-dialog.tsx"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu.tsx"
import { createListAssetsQueryOptions } from "@/api/asset.ts"
import { createListFindingsQueryOptions } from "@/api/finding.ts"
import { createListUsersQueryOptions } from "@/api/user.ts"
import { createUserProfileById } from "@/components/user-label.tsx"
import { formatFindingStatus, formatSeverity } from "@/lib/format.ts"
import { useFindingLifecycle } from "@/hooks/use-finding-lifecycle.ts"

interface FindingTableProps {
  initialGrouping?: Array<string>
  selectedFindingId?: string
  onSelectFinding?: (finding: Finding) => void
}

export function FindingTable({
  initialGrouping = [],
  selectedFindingId,
  onSelectFinding
}: FindingTableProps) {
  const navigate = useNavigate()
  const findingLifecycle = useFindingLifecycle()
  const findingsQuery = useQuery(createListFindingsQueryOptions())
  const assetsQuery = useQuery(createListAssetsQueryOptions())
  const usersQuery = useQuery(createListUsersQueryOptions())
  const [filter, setFilter] = useQueryState("filter")
  const [severityFilter, setSeverityFilter] = useQueryState(
    "severity",
    parseAsArrayOf(parseAsString).withDefault([])
  )
  const [statusFilter, setStatusFilter] = useQueryState(
    "status",
    parseAsArrayOf(parseAsString).withDefault([])
  )
  const [assigneeFilter, setAssigneeFilter] = useQueryState(
    "assignee",
    parseAsArrayOf(parseAsString).withDefault([])
  )

  const filterState = useMemo<DataTableFilterState>(
    () => ({
      globalFilter: filter ?? "",
      selectFilters: {
        ...(severityFilter.length > 0 ? { severity: severityFilter } : {}),
        ...(statusFilter.length > 0 ? { status: statusFilter } : {}),
        ...(assigneeFilter.length > 0 ? { assignee: assigneeFilter } : {})
      }
    }),
    [assigneeFilter, filter, severityFilter, statusFilter]
  )

  const assetsById = useMemo(
    () => new Map((assetsQuery.data ?? []).map((asset) => [asset.id, asset])),
    [assetsQuery.data]
  )
  const assetNamesById = useMemo(
    () =>
      new Map((assetsQuery.data ?? []).map((asset) => [asset.id, asset.name])),
    [assetsQuery.data]
  )
  const userProfileById = useMemo(
    () => createUserProfileById(usersQuery.data),
    [usersQuery.data]
  )

  const columns = useMemo(
    () =>
      createFindingColumns(
        assetNamesById,
        assetsById,
        userProfileById,
        usersQuery.isPending
      ),
    [assetNamesById, assetsById, userProfileById, usersQuery.isPending]
  )

  const groupingOptions = useMemo<Array<GroupingOption>>(
    () => [
      {
        id: "severity",
        label: "Severity",
        formatValue: (value) => formatSeverity(String(value) as never)
      },
      {
        id: "status",
        label: "Status",
        formatValue: (value) => formatFindingStatus(String(value) as never)
      },
      {
        id: "assetId",
        label: "Asset",
        formatValue: (value) =>
          assetNamesById.get(String(value)) ?? "Unknown asset"
      },
      {
        id: "responsibleOwner",
        label: "Asset Owner",
        formatValue: (value) => String(value)
      },
      {
        id: "assignee",
        label: "Assignee",
        formatValue: (value) =>
          String(value) === FINDING_ASSIGNEE_UNASSIGNED_FILTER_VALUE
            ? "Unassigned"
            : formatFindingAssignee(String(value), userProfileById)
      },
      {
        id: "source",
        label: "Source",
        formatValue: (value) => String(value || "Manual")
      }
    ],
    [assetNamesById, userProfileById]
  )

  const handleOpenFinding = async (finding: Finding) => {
    await navigate({
      to: "/findings/$id",
      params: {
        id: finding.id
      }
    })
  }

  const handleDeleteFindings = async (findings: Array<Finding>) => {
    const confirmed = await ConfirmDialog.call({
      title: "Delete Findings",
      description: "This action cannot be undone",
      message: `Are you sure you want to delete ${findings.length} findings(s)?`,
      confirmVariant: "destructive"
    })

    if (confirmed) {
      await findingLifecycle.deleteFindings(findings)
    }
  }

  const handleCreateFinding = async () => {
    await navigate({
      to: "/findings/new"
    })
  }

  const handleBulkUpdate = async <TKey extends "severity" | "status">(
    findings: Array<Finding>,
    key: TKey,
    value: Finding[TKey]
  ) => {
    await findingLifecycle.bulkUpdateFindingField(findings, key, value)
  }

  function ToolbarElements(selectedRows: Array<Finding>) {
    const hasSelection = selectedRows.length > 0

    return (
      <>
        <Button
          variant="default"
          size="sm"
          className="h-9 rounded-xl"
          onClick={handleCreateFinding}
        >
          <Plus />
          New finding
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                nativeButton={true}
                variant="outline"
                size="sm"
                className="h-9 rounded-xl"
                disabled={!hasSelection}
              >
                <Layers3 />
                Set status
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-52">
            <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
              {selectedRows.length} finding
              {selectedRows.length === 1 ? "" : "s"} selected
            </div>
            <DropdownMenuSeparator />
            {STATUS_ORDER.map((status) => (
              <DropdownMenuItem
                key={status}
                onClick={() => handleBulkUpdate(selectedRows, "status", status)}
              >
                {formatFindingStatus(status)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                nativeButton={true}
                variant="outline"
                size="sm"
                className="h-9 rounded-xl"
                disabled={!hasSelection}
              >
                <Check />
                Set severity
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-44">
            <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
              {selectedRows.length} finding
              {selectedRows.length === 1 ? "" : "s"} selected
            </div>
            <DropdownMenuSeparator />
            {SEVERITY_ORDER.map((severity) => (
              <DropdownMenuItem
                key={severity}
                onClick={() =>
                  handleBulkUpdate(selectedRows, "severity", severity)
                }
              >
                {formatSeverity(severity)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </>
    )
  }

  const handleFilterStateChange = (nextState: DataTableFilterState) => {
    void setFilter(nextState.globalFilter ? nextState.globalFilter : null)
    const nextSeverityFilter = nextState.selectFilters.severity ?? []
    const nextStatusFilter = nextState.selectFilters.status ?? []
    const nextAssigneeFilter = nextState.selectFilters.assignee ?? []

    void setSeverityFilter(
      nextSeverityFilter.length ? nextSeverityFilter : null
    )
    void setStatusFilter(nextStatusFilter.length ? nextStatusFilter : null)
    void setAssigneeFilter(
      nextAssigneeFilter.length ? nextAssigneeFilter : null
    )
  }

  return (
    <DataTable
      columns={columns}
      query={findingsQuery}
      groupingOptions={groupingOptions}
      initialGrouping={initialGrouping}
      filterState={filterState}
      onFilterStateChange={handleFilterStateChange}
      initialSorting={[
        { id: "severity", desc: true },
        { id: "lastSeen", desc: true }
      ]}
      onRowClick={onSelectFinding}
      onRowDoubleClick={handleOpenFinding}
      isRowActive={(finding) => finding.id === selectedFindingId}
      onRowDelete={handleDeleteFindings}
      toolbarControls={ToolbarElements}
      contextMenu={(findingsRef, children, key) => (
        <FindingContextMenu
          key={key}
          findingsRef={findingsRef}
          onDelete={() => handleDeleteFindings(findingsRef.current)}
        >
          {children}
        </FindingContextMenu>
      )}
    />
  )
}
