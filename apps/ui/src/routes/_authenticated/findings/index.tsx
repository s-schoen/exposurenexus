import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { DetailPreviewDialog } from "@/components/detail-preview-dialog.tsx"
import { usePageMeta } from "@/context/page.tsx"
import { FindingTable } from "@/components/finding-table"
import { FindingDetailContent } from "@/components/finding-detail-content.tsx"
import {
  useFindingTableSearchState,
  validateFindingTableSearch
} from "@/hooks/use-finding-table-search-state.ts"

export const Route = createFileRoute("/_authenticated/findings/")({
  validateSearch: (search: Record<string, unknown>) => ({
    ...search,
    selected: typeof search.selected === "string" ? search.selected : undefined,
    ...validateFindingTableSearch(search)
  }),
  component: RouteComponent
})

function RouteComponent() {
  const navigate = useNavigate()
  const search = Route.useSearch()
  const { selected } = search
  const { filterState, onFilterStateChange } = useFindingTableSearchState({
    search,
    to: "/findings"
  })

  usePageMeta({
    title: "Findings",
    description:
      "Track active findings, assignment, severity, and mitigation status across assets."
  })

  return (
    <>
      <FindingTable
        filterState={filterState}
        onFilterStateChange={onFilterStateChange}
        selectedFindingId={selected}
        onSelectFinding={(finding) =>
          navigate({
            to: "/findings",
            replace: true,
            search: (prev) => ({
              ...prev,
              filter: prev.filter,
              severity: prev.severity,
              status: prev.status,
              assignee: prev.assignee,
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
              filter: prev.filter,
              severity: prev.severity,
              status: prev.status,
              assignee: prev.assignee,
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
