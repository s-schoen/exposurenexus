import { Plus } from "lucide-react"
import { useNavigate } from "@tanstack/react-router"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useMemo } from "react"
import { toast } from "sonner"
import type { Finding } from "@openvlp/types/model/finding"
import { DataTable } from "@/components/data-table/data-table.tsx"
import { createFindingColumns } from "@/components/finding-table/columns.tsx"
import { FindingContextMenu } from "@/components/finding-table/context-menu.tsx"
import { Button } from "@/components/ui/button.tsx"
import { ConfirmDialog } from "@/components/confirm-dialog.tsx"
import { createListAssetsQueryOptions } from "@/api/asset.ts"
import { createListFindingsQueryOptions, deleteFinding } from "@/api/finding.ts"

export function FindingTable() {
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

  function ToolbarElements() {
    return (
      <Button
        variant="default"
        size="sm"
        className="h-9 rounded-xl"
        onClick={handleCreateFinding}
      >
        <Plus />
        New finding
      </Button>
    )
  }

  return (
    <DataTable
      columns={columns}
      query={findingsQuery}
      onRowDoubleClick={handleOpenFinding}
      onRowDelete={handleDeleteFindings}
      toolbarControls={ToolbarElements()}
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
