import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { FindingStatus } from "@exposurenexus/types/model/finding"
import { DetailPreviewDialog } from "@/components/detail-preview-dialog.tsx"
import { FindingTable } from "@/components/finding-table"
import { FindingDetailContent } from "@/components/finding-detail-content.tsx"
import { usePageMeta } from "@/context/page.tsx"
import {
  useFindingTableSearchState,
  validateFindingTableSearch
} from "@/hooks/use-finding-table-search-state.ts"

const defaultTriageStatusFilter = [FindingStatus.Active]

export const Route = createFileRoute("/_authenticated/findings/triage")({
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
    to: "/findings/triage",
    defaultStatusFilter: defaultTriageStatusFilter
  })

  usePageMeta({
    title: "Triage Queue",
    description:
      "Work through active findings in a queue optimized for repetitive triage."
  })

  return (
    <>
      <div className="flex flex-col gap-4">
        <FindingTable
          initialGrouping={["assetId"]}
          filterState={filterState}
          onFilterStateChange={onFilterStateChange}
          selectedFindingId={selected}
          onSelectFinding={(finding) =>
            navigate({
              to: "/findings/triage",
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
      </div>
      <DetailPreviewDialog
        selectedId={selected}
        onClose={() =>
          navigate({
            to: "/findings/triage",
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
        description="Review and update the selected finding without leaving the triage queue."
        fullPageHref={selected ? `/findings/${selected}` : undefined}
      >
        {selected && <FindingDetailContent findingId={selected} />}
      </DetailPreviewDialog>
    </>
  )
}
