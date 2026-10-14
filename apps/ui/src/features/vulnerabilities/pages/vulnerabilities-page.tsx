import { useSuspenseQuery } from "@tanstack/react-query";
import { Bug, Plus } from "lucide-react";
import { lazy, useMemo } from "react";

import { DetailPeek } from "@/components/detail-peek.tsx";
import { VulnerabilityList } from "@/features/vulnerabilities/components/vulnerability-list/index.tsx";
import { useCreateVulnerability } from "@/features/vulnerabilities/hooks/use-create-vulnerability.ts";
import { useDeleteVulnerabilities } from "@/features/vulnerabilities/hooks/use-vulnerability-record-actions.ts";
import { useVulnerabilityTableSearchState } from "@/features/vulnerabilities/hooks/use-vulnerability-table-search-state.ts";
import { createListVulnerabilitiesQueryOptions } from "@/features/vulnerabilities/queries/vulnerabilities.ts";
import { usePageMeta } from "@/hooks/use-page-meta.tsx";
import { useSelectedSearchParam } from "@/hooks/use-selected-search-param.ts";

import type { VulnerabilityCatalog } from "@exposurenexus/contracts/model/vulnerability";

const VulnerabilityPreview = lazy(() =>
  import("@/features/vulnerabilities/components/vulnerability-preview.tsx").then((module) => ({
    default: module.VulnerabilityPreview,
  })),
);
const VulnerabilityPeekMenu = lazy(() =>
  import("@/features/vulnerabilities/components/vulnerability-preview.tsx").then((module) => ({
    default: module.VulnerabilityPeekMenu,
  })),
);

interface VulnerabilitiesPageProps {
  search?: Record<string, unknown>;
  selected?: string;
}

export function VulnerabilitiesPage({ search = {}, selected }: VulnerabilitiesPageProps) {
  const createVulnerability = useCreateVulnerability();
  const deleteVulnerabilities = useDeleteVulnerabilities();
  const { filterState, onFilterStateChange, grouping, onGroupingChange } =
    useVulnerabilityTableSearchState({
      search,
    });
  const vulnerabilitiesQuery = useSuspenseQuery(createListVulnerabilitiesQueryOptions());
  const selectedSearch = useSelectedSearchParam<VulnerabilityCatalog>({
    selectedId: selected,
    to: "/vulnerabilities",
    getId: (vulnerability) => vulnerability.id,
  });

  const actions = useMemo(
    () => [
      {
        label: "New catalog entry",
        icon: Plus,
        onClick: () => {
          void createVulnerability();
        },
      },
    ],
    [createVulnerability],
  );

  usePageMeta({
    title: "Vulnerabilities",
    icon: Bug,
    count: vulnerabilitiesQuery.data.length,
    actions,
  });

  return (
    <>
      <VulnerabilityList
        grouping={grouping}
        onGroupingChange={onGroupingChange}
        filterState={filterState}
        onFilterStateChange={onFilterStateChange}
        selectedVulnerabilityId={selectedSearch.selectedId}
        onCreateVulnerability={() => {
          void createVulnerability();
        }}
        onSelectVulnerability={(vulnerability) => {
          void selectedSearch.selectRow(vulnerability);
        }}
        onDeleteVulnerabilities={deleteVulnerabilities}
      />
      <DetailPeek
        selectedId={selectedSearch.selectedId}
        label="Catalog entry details"
        getFullPageHref={(id) => `/vulnerabilities/${id}`}
        menu={(id) => <VulnerabilityPeekMenu vulnerabilityId={id} />}
        onClose={() => {
          void selectedSearch.clearSelected();
        }}
      >
        {(id) => <VulnerabilityPreview vulnerabilityId={id} />}
      </DetailPeek>
    </>
  );
}
