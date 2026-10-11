import { FindingStatus } from "@exposurenexus/contracts/model/finding";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Inbox } from "lucide-react";

import { DetailPreviewDialog } from "@/components/detail-preview-dialog.tsx";
import { FindingPreview } from "@/features/findings/components/finding-preview.tsx";
import { FindingTable } from "@/features/findings/components/finding-table/index.tsx";
import { useFindingTableSearchState } from "@/features/findings/hooks/use-finding-table-search-state.ts";
import { createListFindingsQueryOptions } from "@/features/findings/queries/findings.ts";
import { usePageMeta } from "@/hooks/use-page-meta.tsx";
import { useSelectedSearchParam } from "@/hooks/use-selected-search-param.ts";

import type { Finding } from "@exposurenexus/contracts/model/finding";

interface TriageFindingsPageProps {
  search?: Record<string, unknown>;
  selected?: string;
}

const defaultTriageStatusFilter = [FindingStatus.Active];

export function TriageFindingsPage({ search = {}, selected }: TriageFindingsPageProps) {
  const findings = useSuspenseQuery(createListFindingsQueryOptions());
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
    title: "Triage",
    icon: Inbox,
    count: findings.data.filter((finding) => finding.status === FindingStatus.Active).length,
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
        {selected && <FindingPreview findingId={selected} />}
      </DetailPreviewDialog>
    </>
  );
}
