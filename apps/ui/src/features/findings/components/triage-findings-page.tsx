import { FindingStatus } from "@exposurenexus/contracts/model/finding";

import { DetailPreviewDialog } from "@/components/detail-preview-dialog.tsx";
import { FindingDetailContent } from "@/components/finding-detail-content.tsx";
import { FindingTable } from "@/components/finding-table";
import { usePageMeta } from "@/context/page.tsx";
import { useFindingTableSearchState } from "@/hooks/use-finding-table-search-state.ts";
import { useSelectedSearchParam } from "@/hooks/use-selected-search-param.ts";

import type { Finding } from "@exposurenexus/contracts/model/finding";

interface TriageFindingsPageProps {
  search?: Record<string, unknown>;
  selected?: string;
}

const defaultTriageStatusFilter = [FindingStatus.Active];

export function TriageFindingsPage({ search = {}, selected }: TriageFindingsPageProps) {
  const { filterState, onFilterStateChange } = useFindingTableSearchState({
    search,
    to: "/findings/triage",
    defaultStatusFilter: defaultTriageStatusFilter,
  });
  const selectedSearch = useSelectedSearchParam<Finding>({
    selectedId: selected,
    to: "/findings/triage",
    replace: true,
    getId: (finding) => finding.id,
  });

  usePageMeta({
    title: "Triage Queue",
    description: "Work through active findings in a queue optimized for repetitive triage.",
  });

  return (
    <>
      <div className="flex flex-col gap-4">
        <FindingTable
          initialGrouping={["assetId"]}
          filterState={filterState}
          onFilterStateChange={onFilterStateChange}
          selectedFindingId={selectedSearch.selectedId}
          onSelectFinding={(finding) => {
            void selectedSearch.selectRow(finding);
          }}
        />
      </div>
      <DetailPreviewDialog
        selectedId={selectedSearch.selectedId}
        onClose={() => {
          void selectedSearch.clearSelected();
        }}
        title="Finding details"
        description="Review and update the selected finding without leaving the triage queue."
        fullPageHref={selected ? `/findings/${selected}` : undefined}
      >
        {selected && <FindingDetailContent findingId={selected} />}
      </DetailPreviewDialog>
    </>
  );
}
