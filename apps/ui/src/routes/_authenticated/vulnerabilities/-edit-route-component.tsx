import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { CircleAlert } from "lucide-react"
import { createVulnerabilityByIDQueryOptions } from "@/api/vulnerability.ts"
import {
  VulnerabilityForm,
  mapUpdateVulnerabilityFormValues,
  mapVulnerabilityToFormValues
} from "@/components/vulnerability-form.tsx"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card.tsx"
import { Skeleton } from "@/components/ui/skeleton.tsx"
import { usePageMeta } from "@/context/page.tsx"
import { useVulnerabilityLifecycle } from "@/hooks/use-vulnerability-lifecycle.ts"

interface EditVulnerabilityRouteComponentProps {
  vulnerabilityId: string
}

export function EditVulnerabilityRouteComponent({
  vulnerabilityId
}: EditVulnerabilityRouteComponentProps) {
  const navigate = useNavigate()
  const vulnerabilityLifecycle = useVulnerabilityLifecycle()
  const vulnerability = useQuery(
    createVulnerabilityByIDQueryOptions(vulnerabilityId)
  )

  usePageMeta({
    title: vulnerability.data?.title
      ? `Edit ${vulnerability.data.title}`
      : "Edit Vulnerability",
    description: "Update vulnerability catalog metadata."
  })

  const handleCancel = async () => {
    await navigate({
      to: "/vulnerabilities/$id",
      params: { id: vulnerabilityId }
    })
  }

  const handleSubmit = async (
    values: Parameters<typeof mapUpdateVulnerabilityFormValues>[0]
  ) => {
    const payload = mapUpdateVulnerabilityFormValues(values)
    const updatedVulnerability = await vulnerabilityLifecycle.updateVulnerability(
      vulnerabilityId,
      payload
    )

    if (updatedVulnerability) {
      await navigate({
        to: "/vulnerabilities/$id",
        params: { id: vulnerabilityId }
      })
    }
  }

  if (vulnerability.isPending) {
    return (
      <Card className="border-border/60 bg-shell-panel shadow-(--shell-shadow)">
        <CardHeader>
          <CardTitle>Edit vulnerability</CardTitle>
          <CardDescription>Loading vulnerability details.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    )
  }

  if (!vulnerability.data) {
    return (
      <Card className="border-border/60 bg-shell-panel shadow-(--shell-shadow)">
        <CardHeader>
          <CardTitle>Edit vulnerability</CardTitle>
          <CardDescription>
            The selected vulnerability could not be loaded for editing.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>Unable to load edit form</AlertTitle>
            <AlertDescription>{vulnerability.error.message}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  return (
    <VulnerabilityForm
      mode="edit"
      defaultValues={mapVulnerabilityToFormValues(vulnerability.data)}
      onSubmit={handleSubmit}
      onCancel={handleCancel}
    />
  )
}
