import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { DetailPreviewDialog } from "@/components/detail-preview-dialog.tsx"
import { usePageMeta } from "@/context/page.tsx"
import { FindingTable } from "@/components/finding-table"
import { FindingDetailContent } from "@/components/finding-detail-content.tsx"

export const Route = createFileRoute("/_authenticated/findings/")({
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
    title: "Findings",
    description:
      "Track active issues, ownership, severity, and remediation status across assets."
  })

  return (
    <>
      <FindingTable
        selectedFindingId={selected}
        onSelectFinding={(finding) =>
          navigate({
            to: "/findings",
            replace: true,
            search: (prev) => ({
              ...prev,
              selected: finding.id
            })
          })
        }
      />
      <DetailPreviewDialog
        selectedId={selected}
        onClose={() =>
          navigate({
            to: "/findings",
            replace: true,
            search: (prev) => ({
              ...prev,
              selected: undefined
            })
          })
        }
        title="Finding details"
        description="Review and update the selected finding without leaving the findings table."
        fullPageHref={selected ? `/findings/${selected}` : undefined}
      >
        {selected && <FindingDetailContent findingId={selected} />}
      </DetailPreviewDialog>
    </>
  )
}
