import { Link } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft } from "lucide-react"
import { createVulnerabilityByIDQueryOptions } from "@/api/vulnerability.ts"
import { VulnerabilityDetailContent } from "@/components/vulnerability-detail-content.tsx"
import { buttonVariants } from "@/components/ui/button.tsx"
import { usePageMeta } from "@/context/page.tsx"
import { cn } from "@/lib/utils.ts"

interface VulnerabilityDetailRouteComponentProps {
  vulnerabilityId: string
}

export function VulnerabilityDetailRouteComponent({
  vulnerabilityId
}: VulnerabilityDetailRouteComponentProps) {
  const vulnerability = useQuery(
    createVulnerabilityByIDQueryOptions(vulnerabilityId)
  )

  usePageMeta({
    title: vulnerability.data?.title ?? "Vulnerability",
    description:
      "Review vulnerability metadata, classification references, and the full technical description."
  })

  return (
    <VulnerabilityDetailContent
      vulnerabilityId={vulnerabilityId}
      titleAction={
        <Link
          to="/vulnerabilities"
          search={{ selected: undefined }}
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "-ml-2 rounded-xl"
          )}
        >
          <ArrowLeft />
          Back to vulnerabilities
        </Link>
      }
    />
  )
}
