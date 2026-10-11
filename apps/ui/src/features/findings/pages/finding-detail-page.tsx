import { useSuspenseQuery } from "@tanstack/react-query";
import { Pencil, ShieldAlert } from "lucide-react";
import { useMemo, useState } from "react";

import { createAssetByIDQueryOptions } from "@/features/assets";
import { FindingDetailContent } from "@/features/findings/components/finding-detail-content.tsx";
import { FindingDetailsDialog } from "@/features/findings/components/finding-details-dialog.tsx";
import { createFindingByIDQueryOptions } from "@/features/findings/queries/findings.ts";
import { usePageMeta } from "@/hooks/use-page-meta.tsx";

interface FindingDetailPageProps {
  findingId: string;
}

export function FindingDetailPage({ findingId }: FindingDetailPageProps) {
  const finding = useSuspenseQuery(createFindingByIDQueryOptions(findingId));
  const asset = useSuspenseQuery(createAssetByIDQueryOptions(finding.data.assetId));
  const [editingDetails, setEditingDetails] = useState(false);
  const menu = useMemo(
    () => [{ label: "Edit details", icon: Pencil, onClick: () => setEditingDetails(true) }],
    [],
  );

  usePageMeta({
    title: finding.data.title,
    icon: ShieldAlert,
    breadcrumbs: [{ label: "Findings", to: "/findings" }],
    menu,
  });

  return (
    <>
      <FindingDetailContent finding={finding.data} asset={asset.data} />
      <FindingDetailsDialog
        finding={finding.data}
        open={editingDetails}
        onOpenChange={setEditingDetails}
      />
    </>
  );
}
