import { useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"
import {
  createListVulnerabilitiesQueryOptions,
  useCreateVulnerabilityMutation
} from "@/api/vulnerability.ts"
import {
  VulnerabilityForm,
  mapCreateVulnerabilityFormValues
} from "@/components/vulnerability-form.tsx"
import { usePageMeta } from "@/context/page.tsx"
import { toastActionError } from "@/lib/action-error-toast.ts"

export function CreateVulnerabilityRouteComponent() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const vulnerabilityCreate = useCreateVulnerabilityMutation()

  usePageMeta({
    title: "Create Vulnerability",
    description: "Add a catalog entry for a reusable vulnerability."
  })

  const handleCancel = async () => {
    await navigate({
      to: "/vulnerabilities",
      search: { selected: undefined }
    })
  }

  const handleSubmit = async (
    values: Parameters<typeof mapCreateVulnerabilityFormValues>[0]
  ) => {
    const payload = mapCreateVulnerabilityFormValues(values)

    try {
      const vulnerability = await vulnerabilityCreate.mutateAsync(payload)
      await queryClient.invalidateQueries({
        queryKey: createListVulnerabilitiesQueryOptions().queryKey
      })
      toast.success(`Created vulnerability ${payload.title}`)
      await navigate({
        to: "/vulnerabilities/$id",
        params: { id: vulnerability.id }
      })
    } catch (error) {
      toastActionError(error, `Failed to create vulnerability: ${error}`)
      console.error(error)
    }
  }

  return (
    <VulnerabilityForm
      mode="create"
      onSubmit={handleSubmit}
      onCancel={handleCancel}
    />
  )
}
