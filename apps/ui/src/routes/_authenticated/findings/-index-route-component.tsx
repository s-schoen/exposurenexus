import type { Finding } from "@exposurenexus/types/model/finding"
import { DetailPreviewDialog } from "@/components/detail-preview-dialog.tsx"
import { FindingDetailContent } from "@/components/finding-detail-content.tsx"
import { FindingTable } from "@/components/finding-table"
import { usePageMeta } from "@/context/page.tsx"
import { useFindingTableSearchState } from "@/hooks/use-finding-table-search-state.ts"
import { useSelectedSearchParam } from "@/hooks/use-selected-search-param.ts"

interface FindingsRouteComponentProps {
  search?: Record<string, unknown>
  selected?: string
}

export function FindingsRouteComponent({
  search = {},
  selected
}: FindingsRouteComponentProps) {
  const { filterState, onFilterStateChange } = useFindingTableSearchState({
    search,
    to: "/findings"
  })
  const selectedSearch = useSelectedSearchParam<Finding>({
    selectedId: selected,
    to: "/findings",
    replace: true,
    getId: (finding) => finding.id
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
        selectedFindingId={selectedSearch.selectedId}
        onSelectFinding={(finding) => {
          void selectedSearch.selectRow(finding)
        }}
      />
      <DetailPreviewDialog
        selectedId={selectedSearch.selectedId}
        onClose={() => {
          void selectedSearch.clearSelected()
        }}
        title="Finding details"
        description="Review and update the selected finding without leaving the findings table."
        fullPageHref={selected ? `/findings/${selected}` : undefined}
      >
        {selected && <FindingDetailContent findingId={selected} />}
      </DetailPreviewDialog>
    </>
  )
}
