import { useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Bug, Plus } from "lucide-react";
import { lazy, useMemo } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog.tsx";
import { DetailPeek } from "@/components/detail-peek.tsx";
import { VulnerabilityList } from "@/features/vulnerabilities/components/vulnerability-list/index.tsx";
import { useVulnerabilityLifecycle } from "@/features/vulnerabilities/hooks/use-vulnerability-lifecycle.ts";
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

interface VulnerabilitiesPageProps {
  search?: Record<string, unknown>;
  selected?: string;
}

export function VulnerabilitiesPage({ search = {}, selected }: VulnerabilitiesPageProps) {
  const navigate = useNavigate();
  const vulnerabilityLifecycle = useVulnerabilityLifecycle();
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
          void navigate({ to: "/vulnerabilities/new" });
        },
      },
    ],
    [navigate],
  );

  usePageMeta({
    title: "Vulnerabilities",
    icon: Bug,
    count: vulnerabilitiesQuery.data.length,
    actions,
  });

  const handleDeleteVulnerabilities = async (vulnerabilities: Array<VulnerabilityCatalog>) => {
    const confirmed = await ConfirmDialog.call({
      title: "Delete Vulnerabilities",
      description: "This action cannot be undone",
      message: `Are you sure you want to delete ${vulnerabilities.length} catalog entr${vulnerabilities.length === 1 ? "y" : "ies"}? Linked enrichment will be removed while findings and observations are preserved.`,
      confirmVariant: "destructive",
    });

    if (!confirmed) {
      return;
    }

    const result = await vulnerabilityLifecycle.deleteVulnerabilities(vulnerabilities);
    const deletedVulnerabilityIds = new Set(
      result.successful.map((vulnerability) => vulnerability.id),
    );

    if (selected && deletedVulnerabilityIds.has(selected)) {
      await selectedSearch.clearSelected();
    }
  };

  return (
    <>
      <VulnerabilityList
        grouping={grouping}
        onGroupingChange={onGroupingChange}
        filterState={filterState}
        onFilterStateChange={onFilterStateChange}
        selectedVulnerabilityId={selectedSearch.selectedId}
        onCreateVulnerability={() => {
          void navigate({ to: "/vulnerabilities/new" });
        }}
        onSelectVulnerability={(vulnerability) => {
          void selectedSearch.selectRow(vulnerability);
        }}
        onDeleteVulnerabilities={handleDeleteVulnerabilities}
      />
      <DetailPeek
        selectedId={selectedSearch.selectedId}
        label="Catalog entry details"
        getFullPageHref={(id) => `/vulnerabilities/${id}`}
        onClose={() => {
          void selectedSearch.clearSelected();
        }}
      >
        {(id) => <VulnerabilityPreview vulnerabilityId={id} />}
      </DetailPeek>
    </>
  );
}
