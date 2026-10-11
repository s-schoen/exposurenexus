import { useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ShieldAlert, Upload } from "lucide-react";
import { useMemo } from "react";

import { DetailPreviewDialog } from "@/components/detail-preview-dialog.tsx";
import { FindingPreview } from "@/features/findings/components/finding-preview.tsx";
import { FindingTable } from "@/features/findings/components/finding-table/index.tsx";
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
  const navigate = useNavigate();
  const findings = useSuspenseQuery(createListFindingsQueryOptions());
  const { filterState, onFilterStateChange } = useFindingTableSearchState({
    search,
    to: "/findings",
  });
  const selectedSearch = useSelectedSearchParam<Finding>({
    selectedId: selected,
    to: "/findings",
    replace: true,
    getId: (finding) => finding.id,
  });

  const menu = useMemo(
    () => [
      {
        label: "Import findings",
        icon: Upload,
        onClick: () => {
          void navigate({ to: "/findings/import" });
        },
      },
    ],
    [navigate],
  );

  usePageMeta({
    title: "Findings",
    icon: ShieldAlert,
    count: findings.data.length,
    menu,
  });

  return (
    <>
      <FindingTable
        filterState={filterState}
        onFilterStateChange={onFilterStateChange}
        selectedFindingId={selectedSearch.selectedId}
        onSelectFinding={(finding) => {
          void selectedSearch.selectRow(finding);
        }}
      />
      <DetailPreviewDialog
        selectedId={selectedSearch.selectedId}
        onClose={() => {
          void selectedSearch.clearSelected();
        }}
        title="Finding details"
        description="Review and update the selected finding without leaving the findings table."
        fullPageHref={selected ? `/findings/${selected}` : undefined}
      >
        {selected && <FindingPreview findingId={selected} />}
      </DetailPreviewDialog>
    </>
  );
}
