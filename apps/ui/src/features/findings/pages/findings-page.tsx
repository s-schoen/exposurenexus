import { useSuspenseQuery } from "@tanstack/react-query";
import { Plus, ShieldAlert } from "lucide-react";
import { useMemo } from "react";

import { DetailPeek } from "@/components/detail-peek.tsx";
import { FindingList } from "@/features/findings/components/finding-list/index.tsx";
import {
  FindingPeekMenu,
  FindingPreview,
} from "@/features/findings/components/finding-preview.tsx";
import { useCreateFinding } from "@/features/findings/hooks/use-create-finding.ts";
import { useFindingTableSearchState } from "@/features/findings/hooks/use-finding-table-search-state.ts";
import { createListFindingsQueryOptions } from "@/features/findings/queries/findings.ts";
import { usePageMeta } from "@/hooks/use-page-meta.tsx";
import { useSelectedSearchParam } from "@/hooks/use-selected-search-param.ts";

import type { Finding } from "@exposurenexus/contracts/model/finding";

interface FindingsPageProps {
  search?: Record<string, unknown>;
  selected?: string;
}

export function FindingsPage({ search = {}, selected }: FindingsPageProps) {
  const createFinding = useCreateFinding();
  const findings = useSuspenseQuery(createListFindingsQueryOptions());
  const { filterState, onFilterStateChange, grouping, onGroupingChange } =
    useFindingTableSearchState({
      search,
      to: "/findings",
    });
  const selectedSearch = useSelectedSearchParam<Finding>({
    selectedId: selected,
    to: "/findings",
    replace: true,
    getId: (finding) => finding.id,
  });

  const actions = useMemo(
    () => [
      {
        label: "New finding",
        icon: Plus,
        onClick: () => {
          void createFinding();
        },
      },
    ],
    [createFinding],
  );

  usePageMeta({
    title: "Findings",
    icon: ShieldAlert,
    count: findings.data.length,
    actions,
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
