import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import type { AssetCustomFieldDefinition } from "@exposurenexus/types/model/asset-custom-field"
import { createListAssetCustomFieldDefinitionsQueryOptions } from "@/api/asset-custom-field.ts"
import { AssetCustomFieldTable } from "@/components/asset-custom-field-table"
import { AssetCustomFieldDetailContent } from "@/components/asset-custom-field-detail-content"
import { ConfirmDialog } from "@/components/confirm-dialog.tsx"
import { DetailPreviewDialog } from "@/components/detail-preview-dialog.tsx"
import { usePageMeta } from "@/context/page.tsx"
import { useAssetCustomFieldDefinitionLifecycle } from "@/hooks/use-asset-custom-field-definition-lifecycle.ts"
import { useCustomFieldTableSearchState } from "@/hooks/use-custom-field-table-search-state.ts"
import { useSelectedSearchParam } from "@/hooks/use-selected-search-param.ts"

interface CustomFieldsPageProps {
  search?: Record<string, unknown>
  selected?: string
}

export function CustomFieldsPage({
  search = {},
  selected
}: CustomFieldsPageProps) {
  const navigate = useNavigate()
  const fieldLifecycle = useAssetCustomFieldDefinitionLifecycle()
  const { filterState, onFilterStateChange } = useCustomFieldTableSearchState({
    search
  })
  const selectedSearch = useSelectedSearchParam<AssetCustomFieldDefinition>({
    selectedId: selected,
    to: "/custom-fields",
    replace: true,
    getId: (field) => field.id
  })
  const customFieldsQuery = useQuery(
    createListAssetCustomFieldDefinitionsQueryOptions()
  )

  usePageMeta({
    title: "Custom Fields",
    description: "Manage asset metadata fields."
  })

  const handleOpenCustomField = async (field: AssetCustomFieldDefinition) => {
    await navigate({
      to: "/custom-fields/$id",
      params: { id: field.id }
    })
  }

  const handleDeleteCustomFields = async (
    fields: Array<AssetCustomFieldDefinition>
  ) => {
    const confirmed = await ConfirmDialog.call({
      title: "Delete Custom Fields",
      description: "This action cannot be undone",
      message: `Are you sure you want to delete ${fields.length} custom field(s)?`,
      confirmVariant: "destructive"
    })

    if (!confirmed) {
      return
    }

    const result = await fieldLifecycle.deleteDefinitions(fields)
    const deletedFieldIds = new Set(result.successful.map((field) => field.id))

    if (selected && deletedFieldIds.has(selected)) {
      await selectedSearch.clearSelected()
    }
  }

  return (
    <>
      <AssetCustomFieldTable
        query={customFieldsQuery}
        selectedCustomFieldId={selectedSearch.selectedId}
        filterState={filterState}
        onFilterStateChange={onFilterStateChange}
        onSelectCustomField={(field) => {
          void selectedSearch.selectRow(field)
        }}
        onOpenCustomField={(field) => {
          void handleOpenCustomField(field)
        }}
        onCreateCustomField={() => {
          void navigate({ to: "/custom-fields/new" })
        }}
        onDeleteCustomFields={handleDeleteCustomFields}
      />
      <DetailPreviewDialog
        selectedId={selectedSearch.selectedId}
        title="Custom field details"
        description="Preview asset custom field configuration."
        fullPageHref={selected ? `/custom-fields/${selected}` : undefined}
        onClose={() => {
          void selectedSearch.clearSelected()
        }}
      >
        {selected ? (
          <AssetCustomFieldDetailContent customFieldId={selected} />
        ) : null}
      </DetailPreviewDialog>
    </>
  )
}
