import { useSuspenseQuery } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";

import { createAssetByIDQueryOptions } from "@/features/assets";
import { FindingDetailContent } from "@/features/findings/components/finding-detail-content.tsx";
import { createFindingByIDQueryOptions } from "@/features/findings/queries/findings.ts";
import { usePageMeta } from "@/hooks/use-page-meta.tsx";

interface FindingDetailPageProps {
  findingId: string;
}

export function FindingDetailPage({ findingId }: FindingDetailPageProps) {
  const finding = useSuspenseQuery(createFindingByIDQueryOptions(findingId));
  const asset = useSuspenseQuery(createAssetByIDQueryOptions(finding.data.assetId));

  usePageMeta({
    title: finding.data.title,
    icon: ShieldAlert,
    breadcrumbs: [{ label: "Findings", to: "/findings" }],
  });

  return <FindingDetailContent finding={finding.data} asset={asset.data} />;
}
