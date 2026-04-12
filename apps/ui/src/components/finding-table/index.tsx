import { Check, Layers3, Plus } from "lucide-react"
import { useNavigate } from "@tanstack/react-router"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useMemo } from "react"
import { toast } from "sonner"
import type { Finding } from "@openvlp/types/model/finding"
import { DataTable } from "@/components/data-table/data-table.tsx"
import { createFindingColumns } from "@/components/finding-table/columns.tsx"
import {
  SEVERITY_ORDER,
  STATUS_ORDER
} from "@/components/finding-table/constants.ts"
import { FindingContextMenu } from "@/components/finding-table/context-menu.tsx"
import type { GroupingOption } from "@/components/data-table/types.ts"
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
import {
  createListFindingsQueryOptions,
  deleteFinding,
  updateFinding
} from "@/api/finding.ts"
import { formatFindingStatus, formatSeverity } from "@/lib/format.ts"

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
  const queryClient = useQueryClient()
  const findingsQuery = useQuery(createListFindingsQueryOptions())
  const assetsQuery = useQuery(createListAssetsQueryOptions())

  const assetNamesById = useMemo(
    () =>
      new Map((assetsQuery.data ?? []).map((asset) => [asset.id, asset.name])),
    [assetsQuery.data]
  )

  const columns = useMemo(
    () => createFindingColumns(assetNamesById),
    [assetNamesById]
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
        id: "source",
        label: "Source",
        formatValue: (value) => String(value || "Manual")
      }
    ],
    [assetNamesById]
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
      let success = true
      for (const finding of findings) {
        try {
          await deleteFinding(finding.id)
        } catch (error) {
          success = false
          toast.error(`Failed to delete finding ${finding.id}: ${error}`)
          console.error(error)
        }
      }
      if (success) {
        toast.success(`Deleted ${findings.length} findings(s)!`)
      }
      queryClient.invalidateQueries({
        queryKey: createListFindingsQueryOptions().queryKey
      })
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
    if (findings.length === 0) {
      return
    }

    let success = true

    for (const finding of findings) {
      try {
        await updateFinding({ ...finding, [key]: value })
      } catch (error) {
        success = false
        toast.error(`Failed to update finding ${finding.id}: ${error}`)
        console.error(error)
      }
    }

    if (success) {
      toast.success(`Updated ${findings.length} finding(s)`)
    }

    queryClient.invalidateQueries({
      queryKey: createListFindingsQueryOptions().queryKey
    })
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

  return (
    <DataTable
      columns={columns}
      query={findingsQuery}
      groupingOptions={groupingOptions}
      initialGrouping={initialGrouping}
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
