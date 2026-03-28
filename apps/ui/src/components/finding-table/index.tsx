import { Plus } from "lucide-react"
import { useNavigate } from "@tanstack/react-router"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import type { Finding } from "@openvlp/types/model/finding"
import { DataTable } from "@/components/data-table/data-table.tsx"
import { columns } from "@/components/finding-table/columns.tsx"
import { FindingContextMenu } from "@/components/finding-table/context-menu.tsx"
import { Button } from "@/components/ui/button.tsx"
import { ConfirmDialog } from "@/components/confirm-dialog.tsx"
import { createListFindingsQueryOptions, deleteFinding } from "@/api/finding.ts"

export function FindingTable() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const findingsQuery = useQuery(createListFindingsQueryOptions())

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
        variant="outline"
        size="sm"
        className="ml-auto hidden h-8 lg:flex"
        onClick={handleCreateFinding}
      >
        <Plus />
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
