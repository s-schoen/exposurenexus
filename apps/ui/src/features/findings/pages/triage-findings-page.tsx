import { FindingStatus } from "@exposurenexus/contracts/model/finding";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Inbox } from "lucide-react";

import { DetailPeek } from "@/components/detail-peek.tsx";
import { FindingList } from "@/features/findings/components/finding-list/index.tsx";
import {
  FindingPeekMenu,
  FindingPreview,
} from "@/features/findings/components/finding-preview.tsx";
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
    count: findings.data.filter((finding) => finding.status === FindingStatus.Active).length,
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
