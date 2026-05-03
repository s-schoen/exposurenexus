import { useNavigate } from "@tanstack/react-router"
import { DetailPreviewDialog } from "@/components/detail-preview-dialog.tsx"
import { VulnerabilityDetailContent } from "@/components/vulnerability-detail-content.tsx"
import { VulnerabilityTable } from "@/components/vulnerability-table"
import { usePageMeta } from "@/context/page.tsx"

interface VulnerabilitiesRouteComponentProps {
  selected?: string
}

export function VulnerabilitiesRouteComponent({
  selected
}: VulnerabilitiesRouteComponentProps) {
  const navigate = useNavigate()

  usePageMeta({
    title: "Vulnerabilities",
    description:
      "Browse the underlying vulnerability catalog and inspect severity classification."
  })

  return (
    <>
      <VulnerabilityTable
        selectedVulnerabilityId={selected}
        onSelectVulnerability={(vulnerability) =>
          navigate({
            to: "/vulnerabilities",
            search: (prev) => ({
              ...prev,
              selected: vulnerability.id
            })
          })
        }
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
