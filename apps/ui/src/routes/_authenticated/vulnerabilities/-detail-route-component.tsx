import { Link, useNavigate } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import { ArrowLeft, Pencil } from "lucide-react"
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
  const navigate = useNavigate()
  const vulnerability = useQuery(
    createVulnerabilityByIDQueryOptions(vulnerabilityId)
  )
  const actions = useMemo(() => {
    if (!vulnerability.data) {
      return []
    }

    return [
      {
        label: "Edit vulnerability",
        icon: Pencil,
        onClick: () => {
          void navigate({
            to: "/vulnerabilities/$id/edit",
            params: { id: vulnerabilityId }
          })
        }
      }
    ]
  }, [navigate, vulnerability.data, vulnerabilityId])

  usePageMeta({
    title: vulnerability.data?.title ?? "Vulnerability",
    description:
      "Review vulnerability metadata, classification references, and the full technical description.",
    actions
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
