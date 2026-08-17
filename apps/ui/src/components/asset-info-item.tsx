import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ExternalLink, Server } from "lucide-react";

import { createAssetByIDQueryOptions } from "@/api/asset.ts";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { capitalizeFirstLetter } from "@/lib/format.ts";

interface AssetInfoItemProps {
  assetId: string;
}

export function AssetInfoItem({ assetId }: AssetInfoItemProps) {
  const asset = useQuery(createAssetByIDQueryOptions(assetId));

  return (
    <Item variant="outline">
      <ItemMedia>
        <Server size={48} className="text-accent-foreground" />
      </ItemMedia>
      <ItemContent>
        <ItemTitle className="font-semibold">
          {asset.isLoading ? <Skeleton className="w-32" /> : asset.data?.displayName}
        </ItemTitle>
        <ItemDescription>
          {asset.isLoading ? (
            <Skeleton className="w-32" />
          ) : (
            capitalizeFirstLetter(asset.data?.type ?? "")
          )}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <Link
          to="/assets/$id"
          params={{ id: assetId }}
          disabled={asset.isLoading}
          aria-label={`Open ${asset.data?.displayName ?? "asset"}`}
        >
          <ExternalLink className="text-accent-foreground mr-2" size={20} />
        </Link>
      </ItemActions>
    </Item>
  );
}
