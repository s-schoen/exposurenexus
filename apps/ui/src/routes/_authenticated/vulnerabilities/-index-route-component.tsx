import { useNavigate } from "@tanstack/react-router"
import type { Vulnerability } from "@exposurenexus/types/model/vulnerability"
import { ConfirmDialog } from "@/components/confirm-dialog.tsx"
import { DetailPreviewDialog } from "@/components/detail-preview-dialog.tsx"
import { VulnerabilityDetailContent } from "@/components/vulnerability-detail-content.tsx"
import { VulnerabilityTable } from "@/components/vulnerability-table"
import { usePageMeta } from "@/context/page.tsx"
import { useVulnerabilityLifecycle } from "@/hooks/use-vulnerability-lifecycle.ts"

interface VulnerabilitiesRouteComponentProps {
  selected?: string
}

export function VulnerabilitiesRouteComponent({
  selected
}: VulnerabilitiesRouteComponentProps) {
  const navigate = useNavigate()
  const vulnerabilityLifecycle = useVulnerabilityLifecycle()

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

    const result =
      await vulnerabilityLifecycle.deleteVulnerabilities(vulnerabilities)
    const deletedVulnerabilityIds = new Set(
      result.successful.map((vulnerability) => vulnerability.id)
    )

    if (selected && deletedVulnerabilityIds.has(selected)) {
      await navigate({
        to: "/vulnerabilities",
        search: (prev) => ({
          ...prev,
          selected: undefined
        })
      })
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
