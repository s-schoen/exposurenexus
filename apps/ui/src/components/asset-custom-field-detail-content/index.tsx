import { useCallback, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import type { AssetCustomFieldDefinition } from "@exposurenexus/types/model/asset-custom-field"
import type { ReactNode } from "react"
import type { CustomFieldUpdateResult } from "@/components/asset-custom-field-detail-content/helpers.ts"
import { createAssetCustomFieldDefinitionByIDQueryOptions } from "@/api/asset-custom-field.ts"
import {
  createAssetCustomFieldUpdatePayload,
  summarizeCustomField,
  validateAssetCustomFieldDefinition
} from "@/components/asset-custom-field-detail-content/helpers.ts"
import {
  CustomFieldDefinitionCard,
  CustomFieldOverviewCard,
  SelectOptionsCard
} from "@/components/asset-custom-field-detail-content/detail-cards.tsx"
import { CustomFieldSidebar } from "@/components/asset-custom-field-detail-content/sidebar.tsx"
import { DetailQueryBoundary } from "@/components/detail-query-boundary.tsx"
import { useAssetCustomFieldDefinitionLifecycle } from "@/hooks/use-asset-custom-field-definition-lifecycle.ts"

export {
  addAssetCustomFieldOption,
  createAssetCustomFieldUpdatePayload,
  removeAssetCustomFieldOption,
  updateAssetCustomFieldOption,
  updateAssetCustomFieldType,
  validateAssetCustomFieldDefinition
} from "@/components/asset-custom-field-detail-content/helpers.ts"

interface AssetCustomFieldDetailContentProps {
  customFieldId: string
  titleAction?: ReactNode
}

export function AssetCustomFieldDetailContent({
  customFieldId,
  titleAction
}: AssetCustomFieldDetailContentProps) {
  const fieldLifecycle = useAssetCustomFieldDefinitionLifecycle()
  const queryOptions = useMemo(
    () => createAssetCustomFieldDefinitionByIDQueryOptions(customFieldId),
    [customFieldId]
  )
  const customField = useQuery(queryOptions)

  const handleUpdateField = useCallback(
    async (nextField: AssetCustomFieldDefinition) => {
      if (!customField.data) {
        return
      }

      const validationMessage = validateAssetCustomFieldDefinition(nextField)

      if (validationMessage) {
        toast.error(validationMessage)
        return
      }

      const payload = createAssetCustomFieldUpdatePayload(nextField)

      await fieldLifecycle.updateDefinition(nextField, payload)
    },
    [
      customField.data,
      fieldLifecycle
    ]
  )

  const handleUpdateResult = (result: CustomFieldUpdateResult) => {
    if (result.error) {
      toast.error(result.error)
      return
    }

    if (result.field) {
      void handleUpdateField(result.field)
    }
  }

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
              <SelectOptionsCard
                field={field}
                onUpdateResult={handleUpdateResult}
              />
            </div>
            <CustomFieldSidebar
              field={field}
              summary={summary}
              onUpdateField={handleUpdateField}
              onUpdateResult={handleUpdateResult}
            />
          </div>
        )
      }}
    </DetailQueryBoundary>
  )
}
