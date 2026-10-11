import { useSuspenseQuery } from "@tanstack/react-query";
import { Server } from "lucide-react";

import { AssetDetailContent } from "@/features/assets/components/asset-detail-content.tsx";
import { createAssetByIDQueryOptions } from "@/features/assets/queries/assets.ts";
import { usePageMeta } from "@/hooks/use-page-meta.tsx";

interface AssetDetailPageProps {
  assetId: string;
}

export function AssetDetailPage({ assetId }: AssetDetailPageProps) {
  const asset = useSuspenseQuery(createAssetByIDQueryOptions(assetId));

  usePageMeta({
    title: asset.data.displayName,
    icon: Server,
    breadcrumbs: [{ label: "Assets", to: "/assets" }],
  });

  return <AssetDetailContent asset={asset.data} />;
}
