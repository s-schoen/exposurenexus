import { Link, createFileRoute } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft, Server } from "lucide-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card.tsx"
import { Skeleton } from "@/components/ui/skeleton.tsx"
import { usePageMeta } from "@/context/page.tsx"
import { createAssetByIDQueryOptions } from "@/api/asset.ts"
import { capitalizeFirstLetter } from "@/lib/format.ts"
import { buttonVariants } from "@/components/ui/button.tsx"
import { cn } from "@/lib/utils.ts"
import { DetailHighlightCard } from "@/components/detail-highlight-card.tsx"
import { MetadataSidebar } from "@/components/metadata-sidebar/index.tsx"
import { MetadataDetailRow } from "@/components/metadata-sidebar/metadata-detail-row.tsx"
import { Badge } from "@/components/ui/badge.tsx"

export const Route = createFileRoute("/_authenticated/assets/$id")({
  component: RouteComponent
})

function RouteComponent() {
  const { id } = Route.useParams()
  const asset = useQuery(createAssetByIDQueryOptions(id))

  usePageMeta({
    title: asset.data?.name ?? "Asset",
    description:
      "Inspect the selected asset and review its core inventory metadata."
  })

  function CardPlaceholder() {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Asset details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    )
  }

  function AssetOverviewCard() {
    return (
      <Card className="border-border/60 bg-shell-panel shadow-(--shell-shadow)">
        <CardHeader className="gap-4">
          <div className="flex items-center justify-between gap-3">
            <Link
              to="/assets"
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "-ml-2 w-fit rounded-xl"
              )}
            >
              <ArrowLeft />
              Back to assets
            </Link>
            <Badge variant="outline" className="rounded-md">
              <Server className="size-3" />
              {capitalizeFirstLetter(asset.data!.type)}
            </Badge>
          </div>
          <div className="space-y-3">
            <div className="space-y-2">
              <CardTitle className="text-2xl font-semibold tracking-tight">
                {asset.data!.name}
              </CardTitle>
              <CardDescription className="max-w-3xl text-sm leading-6">
                Inventory record representing a tracked platform asset that can
                be linked to findings and vulnerability exposure.
              </CardDescription>
            </div>
            <div className="grid gap-3 xl:grid-cols-3">
              <DetailHighlightCard
                label="Asset name"
                value={asset.data!.name}
                description="Primary identifier used across the platform"
              />
              <DetailHighlightCard
                label="Asset type"
                value={capitalizeFirstLetter(asset.data!.type)}
                description="Inventory classification for this asset"
              />
            </div>
          </div>
        </CardHeader>
      </Card>
    )
  }

  function AssetSidebar() {
    return (
      <MetadataSidebar title="Asset details" icon={Server}>
        <div className="space-y-3">
          <MetadataDetailRow label="Name" value={asset.data!.name} />
          <MetadataDetailRow
            label="Type"
            value={capitalizeFirstLetter(asset.data!.type)}
          />
        </div>
      </MetadataSidebar>
    )
  }

  return asset.isPending ? (
    <CardPlaceholder />
  ) : (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex min-w-0 flex-col gap-4">
        <AssetOverviewCard />
      </div>
      <AssetSidebar />
    </div>
  )
}
