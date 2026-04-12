import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { DetailPreviewDialog } from "@/components/detail-preview-dialog.tsx"
import { usePageMeta } from "@/context/page.tsx"
import { VulnerabilityTable } from "@/components/vulnerability-table"
import { VulnerabilityDetailContent } from "@/components/vulnerability-detail-content.tsx"

export const Route = createFileRoute("/_authenticated/vulnerabilities/")({
  validateSearch: (search) => ({
    ...search,
    selected: typeof search.selected === "string" ? search.selected : undefined
  }),
  component: RouteComponent
})

function RouteComponent() {
  const navigate = useNavigate()
  const { selected } = Route.useSearch()

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
