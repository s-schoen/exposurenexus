import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { buttonVariants } from "@/components/ui/button.tsx";
import { AssetDetailContent } from "@/features/assets/components/asset-detail-content.tsx";
import { createAssetByIDQueryOptions } from "@/features/assets/queries/assets.ts";
import { usePageMeta } from "@/hooks/use-page-meta.tsx";
import { cn } from "@/lib/utils.ts";

interface AssetDetailPageProps {
  assetId: string;
}

export function AssetDetailPage({ assetId }: AssetDetailPageProps) {
  const asset = useSuspenseQuery(createAssetByIDQueryOptions(assetId));

  usePageMeta({
    title: asset.data.displayName,
    description: "Inspect the selected asset and review its core inventory metadata.",
  });

  return (
    <AssetDetailContent
      asset={asset.data}
      titleAction={
        <Link
          to="/assets"
          search={{ filter: undefined, selected: undefined }}
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2 rounded-xl")}
        >
          <ArrowLeft />
          Back to assets
        </Link>
      }
    />
  );
}
