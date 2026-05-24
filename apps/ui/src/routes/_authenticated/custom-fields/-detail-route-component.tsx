import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"
import { createAssetCustomFieldDefinitionByIDQueryOptions } from "@/api/asset-custom-field.ts"
import { AssetCustomFieldDetailContent } from "@/components/asset-custom-field-detail-content"
import { buttonVariants } from "@/components/ui/button.tsx"
import { usePageMeta } from "@/context/page.tsx"
import { cn } from "@/lib/utils.ts"

interface CustomFieldDetailRouteComponentProps {
  customFieldId: string
}

export function CustomFieldDetailRouteComponent({
  customFieldId
}: CustomFieldDetailRouteComponentProps) {
  const customField = useQuery(
    createAssetCustomFieldDefinitionByIDQueryOptions(customFieldId)
  )

  usePageMeta({
    title: customField.data?.name ?? "Custom Field",
    description: "Review asset custom field settings and allowed values."
  })

  return (
    <AssetCustomFieldDetailContent
      customFieldId={customFieldId}
      titleAction={
        <Link
          to="/custom-fields"
          search={(previous) => ({
            filter: previous.filter,
            type: previous.type,
            required: previous.required,
            selected: undefined
          })}
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
