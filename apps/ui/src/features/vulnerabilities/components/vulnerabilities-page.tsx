import { useNavigate } from "@tanstack/react-router";

import { ConfirmDialog } from "@/components/confirm-dialog.tsx";
import { DetailPreviewDialog } from "@/components/detail-preview-dialog.tsx";
import { VulnerabilityDetailContent } from "@/components/vulnerability-detail-content.tsx";
import { VulnerabilityTable } from "@/components/vulnerability-table";
import { usePageMeta } from "@/hooks/use-page-meta.tsx";
import { useSelectedSearchParam } from "@/hooks/use-selected-search-param.ts";
import { useVulnerabilityLifecycle } from "@/hooks/use-vulnerability-lifecycle.ts";
import { useVulnerabilityTableSearchState } from "@/hooks/use-vulnerability-table-search-state.ts";

import type { VulnerabilityCatalog } from "@exposurenexus/contracts/model/vulnerability";

interface VulnerabilitiesPageProps {
  search?: Record<string, unknown>;
  selected?: string;
}

export function VulnerabilitiesPage({ search = {}, selected }: VulnerabilitiesPageProps) {
  const navigate = useNavigate();
  const vulnerabilityLifecycle = useVulnerabilityLifecycle();
  const { filterState, onFilterStateChange } = useVulnerabilityTableSearchState({
    search,
  });
  const selectedSearch = useSelectedSearchParam<VulnerabilityCatalog>({
    selectedId: selected,
    to: "/vulnerabilities",
    getId: (vulnerability) => vulnerability.id,
  });

  usePageMeta({
    title: "Vulnerabilities",
    description: "Browse catalog entries and inspect their enrichment metadata.",
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
      <VulnerabilityTable
        filterState={filterState}
        onFilterStateChange={onFilterStateChange}
        selectedVulnerabilityId={selectedSearch.selectedId}
        onCreateVulnerability={() =>
          navigate({
            to: "/vulnerabilities/new",
          })
        }
        onSelectVulnerability={(vulnerability) => {
          void selectedSearch.selectRow(vulnerability);
        }}
        onDeleteVulnerabilities={handleDeleteVulnerabilities}
      />
      <DetailPreviewDialog
        selectedId={selectedSearch.selectedId}
        onClose={() => {
          void selectedSearch.clearSelected();
        }}
        title="Catalog entry details"
        description="Review the selected catalog entry without leaving the vulnerability table."
        fullPageHref={selected ? `/vulnerabilities/${selected}` : undefined}
      >
        {selected && <VulnerabilityDetailContent vulnerabilityId={selected} />}
      </DetailPreviewDialog>
    </>
  );
}
