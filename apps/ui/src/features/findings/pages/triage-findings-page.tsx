import { FindingStatus } from "@exposurenexus/contracts/model/finding";
import { Inbox } from "lucide-react";

import { DataListEmpty } from "@/components/data-list/empty-state.tsx";
import { DetailPeek } from "@/components/detail-peek.tsx";
import { FindingList } from "@/features/findings/components/finding-list/index.tsx";
import {
  FindingPeekMenu,
  FindingPreview,
} from "@/features/findings/components/finding-preview.tsx";
import {
  createFindingTableFilterState,
  useFindingTableSearchState,
} from "@/features/findings/hooks/use-finding-table-search-state.ts";
import { usePageMeta } from "@/hooks/use-page-meta.tsx";
import { useSelectedSearchParam } from "@/hooks/use-selected-search-param.ts";

import type { Finding } from "@exposurenexus/contracts/model/finding";

interface TriageFindingsPageProps {
  search?: Record<string, unknown>;
  selected?: string;
}

const defaultTriageStatusFilter = [FindingStatus.Active];
// The queue itself: Triage lists active findings. Matching nothing under it means the queue is empty.
const triageQueueFilterState = createFindingTableFilterState({}, defaultTriageStatusFilter);

export function TriageFindingsPage({ search = {}, selected }: TriageFindingsPageProps) {
  const { filterState, onFilterStateChange, grouping, onGroupingChange } =
    useFindingTableSearchState({
      search,
      to: "/findings/triage",
      defaultStatusFilter: defaultTriageStatusFilter,
      defaultGrouping: "assetId",
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
  });

  return (
    <>
      <FindingList
        grouping={grouping}
        onGroupingChange={onGroupingChange}
        filterState={filterState}
        onFilterStateChange={onFilterStateChange}
        selectedFindingId={selectedSearch.selectedId}
        onSelectFinding={(finding) => {
          void selectedSearch.selectRow(finding);
        }}
        defaultFilterState={triageQueueFilterState}
        emptyState={<DataListEmpty icon={Inbox} message="Nothing to triage." />}
      />
      <DetailPeek
        selectedId={selectedSearch.selectedId}
        label="Finding details"
        getFullPageHref={(id) => `/findings/${id}`}
        menu={(id) => <FindingPeekMenu findingId={id} />}
        onClose={() => {
          void selectedSearch.clearSelected();
        }}
      >
        {(id) => <FindingPreview findingId={id} />}
      </DetailPeek>
    </>
  );
}
