import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"
import { createAssetByIDQueryOptions } from "@/api/asset.ts"
import { AssetDetailContent } from "@/components/asset-detail-content.tsx"
import { buttonVariants } from "@/components/ui/button.tsx"
import { usePageMeta } from "@/context/page.tsx"
import { cn } from "@/lib/utils.ts"

interface AssetDetailPageProps {
  assetId: string
}

export function AssetDetailPage({ assetId }: AssetDetailPageProps) {
  const asset = useQuery(createAssetByIDQueryOptions(assetId))

  usePageMeta({
    title: asset.data?.name ?? "Asset",
    description:
      "Inspect the selected asset and review its core inventory metadata."
  })

  return (
    <AssetDetailContent
      assetId={assetId}
      titleAction={
        <Link
          to="/assets"
          search={{ filter: undefined, selected: undefined }}
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "-ml-2 rounded-xl"
          )}
        >
          <ArrowLeft />
          Back to assets
        </Link>
      }
    />
  )
}
