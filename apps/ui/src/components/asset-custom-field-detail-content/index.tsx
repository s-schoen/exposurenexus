import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import type { ReactNode } from "react"
import { createAssetCustomFieldDefinitionByIDQueryOptions } from "@/api/asset-custom-field.ts"
import { summarizeCustomField } from "@/components/asset-custom-field-detail-content/helpers.ts"
import {
  CustomFieldDefinitionCard,
  CustomFieldOverviewCard,
  SelectOptionsCard
} from "@/components/asset-custom-field-detail-content/detail-cards.tsx"
import { CustomFieldSidebar } from "@/components/asset-custom-field-detail-content/sidebar.tsx"
import { DetailQueryBoundary } from "@/components/detail-query-boundary.tsx"

interface AssetCustomFieldDetailContentProps {
  customFieldId: string
  titleAction?: ReactNode
}

export function AssetCustomFieldDetailContent({
  customFieldId,
  titleAction
}: AssetCustomFieldDetailContentProps) {
  const queryOptions = useMemo(
    () => createAssetCustomFieldDefinitionByIDQueryOptions(customFieldId),
    [customFieldId]
  )
  const customField = useQuery(queryOptions)

  return (
    <DetailQueryBoundary
      query={customField}
      title="Custom field details"
      errorTitle="Unable to load custom field"
      errorDescription="The selected custom field could not be loaded."
      missingMessage="The API did not return a custom field record."
    >
      {(field) => {
        const summary = summarizeCustomField(field)

        return (
          <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="flex min-w-0 flex-col gap-4">
              <CustomFieldOverviewCard
                field={field}
                summary={summary}
                titleAction={titleAction}
              />
              <CustomFieldDefinitionCard field={field} summary={summary} />
              <SelectOptionsCard field={field} />
            </div>
            <CustomFieldSidebar field={field} summary={summary} />
          </div>
        )
      }}
    </DetailQueryBoundary>
  )
}
