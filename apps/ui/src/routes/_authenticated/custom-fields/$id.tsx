import { Link, createFileRoute } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft } from "lucide-react"
import { createAssetCustomFieldDefinitionByIDQueryOptions } from "@/api/asset-custom-field.ts"
import { AssetCustomFieldDetailContent } from "@/components/asset-custom-field-detail-content"
import { buttonVariants } from "@/components/ui/button.tsx"
import { usePageMeta } from "@/context/page.tsx"
import { cn } from "@/lib/utils.ts"

export const Route = createFileRoute("/_authenticated/custom-fields/$id")({
  component: RouteComponent
})

function RouteComponent() {
  const { id } = Route.useParams()
  const customField = useQuery(
    createAssetCustomFieldDefinitionByIDQueryOptions(id)
  )

  usePageMeta({
    title: customField.data?.name ?? "Custom Field",
    description: "Review asset custom field settings and allowed values."
  })

  return (
    <AssetCustomFieldDetailContent
      customFieldId={id}
      titleAction={
        <Link
          to="/custom-fields"
          search={{ selected: undefined }}
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "-ml-2 rounded-xl"
          )}
        >
          <ArrowLeft />
          Back to custom fields
        </Link>
      }
    />
  )
}
