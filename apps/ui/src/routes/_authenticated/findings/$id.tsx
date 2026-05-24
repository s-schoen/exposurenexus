import { Link, createFileRoute } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft } from "lucide-react"
import { createAssetByIDQueryOptions } from "@/api/asset.ts"
import { createFindingByIDQueryOptions } from "@/api/finding.ts"
import { FindingDetailContent } from "@/components/finding-detail-content.tsx"
import { buttonVariants } from "@/components/ui/button.tsx"
import { usePageMeta } from "@/context/page.tsx"
import { formatFindingStatus } from "@/lib/format.ts"
import { cn } from "@/lib/utils.ts"

export const Route = createFileRoute("/_authenticated/findings/$id")({
  component: RouteComponent
})

function RouteComponent() {
  const { id } = Route.useParams()
  const finding = useQuery(createFindingByIDQueryOptions(id))
  const asset = useQuery({
    ...createAssetByIDQueryOptions(finding.data?.assetId ?? ""),
    enabled: Boolean(finding.data?.assetId)
  })

  usePageMeta({
    title: finding.data?.vulnerability.title ?? "Finding",
    description:
      asset.data?.name && finding.data
        ? `${formatFindingStatus(finding.data.status)} finding on ${asset.data.name}`
        : "Inspect, update, and triage a specific finding."
  })

  return (
    <FindingDetailContent
      findingId={id}
      titleAction={
        <Link
          to="/findings"
          search={{
            filter: undefined,
            severity: undefined,
            status: undefined,
            assignee: undefined,
            selected: undefined
          }}
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "-ml-2 rounded-xl"
          )}
        >
          <ArrowLeft />
          Back to findings
        </Link>
      }
    />
  )
}
