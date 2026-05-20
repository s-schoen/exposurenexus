import { useNavigate } from "@tanstack/react-router"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import type { Vulnerability } from "@exposurenexus/types/model/vulnerability"
import {
  createListVulnerabilitiesQueryOptions,
  createVulnerabilityByIDQueryOptions,
  useDeleteVulnerabilityMutation
} from "@/api/vulnerability.ts"
import { ConfirmDialog } from "@/components/confirm-dialog.tsx"
import { DetailPreviewDialog } from "@/components/detail-preview-dialog.tsx"
import { VulnerabilityDetailContent } from "@/components/vulnerability-detail-content.tsx"
import { VulnerabilityTable } from "@/components/vulnerability-table"
import { usePageMeta } from "@/context/page.tsx"
import { toastActionError } from "@/lib/action-error-toast.ts"

interface VulnerabilitiesRouteComponentProps {
  selected?: string
}

export function VulnerabilitiesRouteComponent({
  selected
}: VulnerabilitiesRouteComponentProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const vulnerabilityDelete = useDeleteVulnerabilityMutation()

  usePageMeta({
    title: "Vulnerabilities",
    description:
      "Browse the underlying vulnerability catalog and inspect severity classification."
  })

  const handleDeleteVulnerabilities = async (
    vulnerabilities: Array<Vulnerability>
  ) => {
    const confirmed = await ConfirmDialog.call({
      title: "Delete Vulnerabilities",
      description: "This action cannot be undone",
      message: `Are you sure you want to delete ${vulnerabilities.length} vulnerability record(s)?`,
      confirmVariant: "destructive"
    })

    if (!confirmed) {
      return
    }

    let success = true
    const deletedVulnerabilityIds = new Set<string>()
    for (const vulnerability of vulnerabilities) {
      try {
        await vulnerabilityDelete.mutateAsync(vulnerability.id)
        deletedVulnerabilityIds.add(vulnerability.id)
      } catch (error) {
        success = false
        toastActionError(
          error,
          `Failed to delete vulnerability ${vulnerability.title}: ${error}`
        )
        console.error(error)
      }
    }

    await queryClient.invalidateQueries({
      queryKey: createListVulnerabilitiesQueryOptions().queryKey
    })
    for (const vulnerabilityId of deletedVulnerabilityIds) {
      await queryClient.invalidateQueries({
        queryKey: createVulnerabilityByIDQueryOptions(vulnerabilityId).queryKey
      })
    }

    if (selected && deletedVulnerabilityIds.has(selected)) {
      await navigate({
        to: "/vulnerabilities",
        search: (prev) => ({
          ...prev,
          selected: undefined
        })
      })
    }

    if (success) {
      toast.success(
        `Deleted ${vulnerabilities.length} vulnerability record(s)!`
      )
    }
  }

  return (
    <>
      <VulnerabilityTable
        selectedVulnerabilityId={selected}
        onCreateVulnerability={() =>
          navigate({
            to: "/vulnerabilities/new"
          })
        }
        onSelectVulnerability={(vulnerability) =>
          navigate({
            to: "/vulnerabilities",
            search: (prev) => ({
              ...prev,
              selected: vulnerability.id
            })
          })
        }
        onDeleteVulnerabilities={handleDeleteVulnerabilities}
      />
      <DetailPreviewDialog
        selectedId={selected}
        onClose={() =>
          navigate({
            to: "/vulnerabilities",
            search: (prev) => ({
              ...prev,
              selected: undefined
            })
          })
        }
        title="Vulnerability details"
        description="Review the selected vulnerability without leaving the vulnerability table."
        fullPageHref={selected ? `/vulnerabilities/${selected}` : undefined}
      >
        {selected && <VulnerabilityDetailContent vulnerabilityId={selected} />}
      </DetailPreviewDialog>
    </>
  )
}
