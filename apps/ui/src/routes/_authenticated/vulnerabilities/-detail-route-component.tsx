import { Link, useNavigate } from "@tanstack/react-router"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback, useMemo } from "react"
import { ArrowLeft, Pencil, Trash } from "lucide-react"
import { toast } from "sonner"
import {
  createListVulnerabilitiesQueryOptions,
  createVulnerabilityByIDQueryOptions,
  useDeleteVulnerabilityMutation
} from "@/api/vulnerability.ts"
import { ConfirmDialog } from "@/components/confirm-dialog.tsx"
import { VulnerabilityDetailContent } from "@/components/vulnerability-detail-content.tsx"
import { buttonVariants } from "@/components/ui/button.tsx"
import { usePageMeta } from "@/context/page.tsx"
import { toastActionError } from "@/lib/action-error-toast.ts"
import { cn } from "@/lib/utils.ts"

interface VulnerabilityDetailRouteComponentProps {
  vulnerabilityId: string
}

export function VulnerabilityDetailRouteComponent({
  vulnerabilityId
}: VulnerabilityDetailRouteComponentProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const vulnerabilityDelete = useDeleteVulnerabilityMutation()
  const vulnerability = useQuery(
    createVulnerabilityByIDQueryOptions(vulnerabilityId)
  )
  const handleDeleteVulnerability = useCallback(async () => {
    if (!vulnerability.data) {
      return
    }

    const confirmed = await ConfirmDialog.call({
      title: "Delete Vulnerability",
      description: "This action cannot be undone",
      message: `Are you sure you want to delete ${vulnerability.data.title}?`,
      confirmVariant: "destructive"
    })

    if (!confirmed) {
      return
    }

    try {
      await vulnerabilityDelete.mutateAsync(vulnerability.data.id)
      await queryClient.invalidateQueries({
        queryKey: createListVulnerabilitiesQueryOptions().queryKey
      })
      await queryClient.invalidateQueries({
        queryKey: createVulnerabilityByIDQueryOptions(vulnerability.data.id)
          .queryKey
      })
      toast.success(`Deleted vulnerability ${vulnerability.data.title}`)
      await navigate({
        to: "/vulnerabilities",
        search: { selected: undefined }
      })
    } catch (error) {
      toastActionError(
        error,
        `Failed to delete vulnerability ${vulnerability.data.title}: ${error}`
      )
      console.error(error)
    }
  }, [navigate, queryClient, vulnerability.data, vulnerabilityDelete])
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
      },
      {
        label: "Delete vulnerability",
        icon: Trash,
        variant: "destructive" as const,
        onClick: () => {
          void handleDeleteVulnerability()
        }
      }
    ]
  }, [handleDeleteVulnerability, navigate, vulnerability.data, vulnerabilityId])

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
