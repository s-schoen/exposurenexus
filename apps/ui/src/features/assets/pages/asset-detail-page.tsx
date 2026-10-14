import { useSuspenseQuery } from "@tanstack/react-query";
import { Server } from "lucide-react";

import { AssetDetailContent } from "@/features/assets/components/asset-detail-content.tsx";
import { useAssetRecordActions } from "@/features/assets/hooks/use-asset-record-actions.ts";
import { createAssetByIDQueryOptions } from "@/features/assets/queries/assets.ts";
import { usePageMeta } from "@/hooks/use-page-meta.tsx";

import type { ReactNode } from "react";

interface AssetDetailPageProps {
  assetId: string;
  /** The findings on the asset. The route reads them from the findings feature. */
  findingsSection?: ReactNode;
}

export function AssetDetailPage({ assetId, findingsSection }: AssetDetailPageProps) {
  const asset = useSuspenseQuery(createAssetByIDQueryOptions(assetId));
  const actions = useAssetRecordActions(asset.data);

  usePageMeta({
    title: asset.data.displayName,
    icon: Server,
    breadcrumbs: [{ label: "Assets", to: "/assets" }],
    menu: actions,
  });

  return <AssetDetailContent asset={asset.data} findingsSection={findingsSection} />;
}
