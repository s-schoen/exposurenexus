import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  createAssetCustomFieldDefinition,
  createListAssetCustomFieldDefinitionsQueryOptions
} from "@/api/asset-custom-field.ts"
import {
  AssetCustomFieldForm,
  mapAssetCustomFieldFormValues
} from "@/components/asset-custom-field-form.tsx"
import { usePageMeta } from "@/context/page.tsx"
import { toastActionError } from "@/lib/action-error-toast.ts"

export const Route = createFileRoute("/_authenticated/custom-fields/new")({
  component: RouteComponent
})

function RouteComponent() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  usePageMeta({
    title: "Create Custom Field",
    description: "Define a new asset metadata field."
  })

  const handleCancel = async () => {
    await navigate({
      to: "/custom-fields",
      search: { selected: undefined }
    })
  }

  const handleSubmit = async (
    values: Parameters<typeof mapAssetCustomFieldFormValues>[0]
  ) => {
    const payload = mapAssetCustomFieldFormValues(values)

    try {
      const customField = await createAssetCustomFieldDefinition(payload)
      await queryClient.invalidateQueries({
        queryKey: createListAssetCustomFieldDefinitionsQueryOptions().queryKey
      })
      toast.success(`Created custom field ${payload.name}`)
      await navigate({
        to: "/custom-fields/$id",
        params: { id: customField.id }
      })
    } catch (error) {
      toastActionError(error, `Failed to create custom field: ${error}`)
      console.error(error)
    }
  }

  return (
    <AssetCustomFieldForm
      mode="create"
      onSubmit={handleSubmit}
      onCancel={handleCancel}
    />
  )
}
