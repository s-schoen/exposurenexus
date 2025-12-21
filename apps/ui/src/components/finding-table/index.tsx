import { DataTable } from "@/components/data-table/data-table.tsx"
import { Plus } from "lucide-react"
import { columns } from "@/components/finding-table/columns.tsx"
import { Button } from "@/components/ui/button.tsx"
import { useNavigate } from "@tanstack/react-router"
import { ConfirmDialog } from "@/components/confirm-dialog.tsx"
import { useMutation } from "@tanstack/react-query"
import { toast } from "sonner"
import { useFindings } from "@/hooks/use-findings.ts"
import { deleteFinding } from "@/api/finding.ts"
import type { Finding } from "@openvlp/types/model/finding"

export function FindingTable() {
  const navigate = useNavigate()
  const findingsQuery = useFindings()

  const mutateDeleteFinding = useMutation({
    mutationFn: (id: string) => deleteFinding(id)
  })

  const handleOpenFinding = async (finding: Finding) => {
    await navigate({
      to: "/findings/$id",
      params: {
        id: finding.id
      }
    })
  }

  const handleDeleteFindings = async (findings: Finding[]) => {
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
          await mutateDeleteFinding.mutateAsync(finding.id)
        } catch (error) {
          success = false
          toast.error(`Failed to delete finding ${finding.id}: ${error}`)
          console.error(error)
        }
      }
      if (success) {
        toast.success(`Deleted ${findings.length} findings(s)!`)
      }
      await findingsQuery.refetch()
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
    />
  )
}
