import { useMemo } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { parseAsArrayOf, parseAsString, useQueryState } from "nuqs"
import { toast } from "sonner"
import type { AssetCustomFieldDefinition } from "@openvlp/types/model/asset"
import type { DataTableFilterState } from "@/components/data-table/types.ts"
import {
  createListAssetCustomFieldDefinitionsQueryOptions,
  deleteAssetCustomFieldDefinition
} from "@/api/asset-custom-field.ts"
import { AssetCustomFieldTable } from "@/components/asset-custom-field-table"
import { AssetCustomFieldDetailContent } from "@/components/asset-custom-field-detail-content"
import { ConfirmDialog } from "@/components/confirm-dialog.tsx"
import { DetailPreviewDialog } from "@/components/detail-preview-dialog.tsx"
import { usePageMeta } from "@/context/page.tsx"
import { toastActionError } from "@/lib/action-error-toast.ts"

export const Route = createFileRoute("/_authenticated/custom-fields/")({
  validateSearch: (search) => ({
    ...search,
    selected: typeof search.selected === "string" ? search.selected : undefined
  }),
  component: RouteComponent
})

function RouteComponent() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { selected } = Route.useSearch()
  const customFieldsQuery = useQuery(
    createListAssetCustomFieldDefinitionsQueryOptions()
  )
  const [filter, setFilter] = useQueryState("filter")
  const [typeFilter, setTypeFilter] = useQueryState(
    "type",
    parseAsArrayOf(parseAsString).withDefault([])
  )
  const [requiredFilter, setRequiredFilter] = useQueryState(
    "required",
    parseAsArrayOf(parseAsString).withDefault([])
  )

  const filterState = useMemo<DataTableFilterState>(
    () => ({
      globalFilter: filter ?? "",
      selectFilters: {
        ...(typeFilter.length > 0 ? { type: typeFilter } : {}),
        ...(requiredFilter.length > 0 ? { required: requiredFilter } : {})
      }
    }),
    [filter, typeFilter, requiredFilter]
  )

  usePageMeta({
    title: "Custom Fields",
    description: "Manage asset metadata fields."
  })

  const handleFilterStateChange = (nextState: DataTableFilterState) => {
    void setFilter(nextState.globalFilter ? nextState.globalFilter : null)

    const nextTypeFilter = nextState.selectFilters.type ?? []
    void setTypeFilter(nextTypeFilter.length ? nextTypeFilter : null)

    const nextRequiredFilter = nextState.selectFilters.required ?? []
    void setRequiredFilter(
      nextRequiredFilter.length ? nextRequiredFilter : null
    )
  }

  const handleSelectCustomField = async (field: AssetCustomFieldDefinition) => {
    await navigate({
      to: "/custom-fields",
      replace: true,
      search: (prev) => ({
        ...prev,
        selected: field.id
      })
    })
  }

  const handleOpenCustomField = async (field: AssetCustomFieldDefinition) => {
    await navigate({
      to: "/custom-fields/$id",
      params: { id: field.id }
    })
  }

  const handleClearSelectedCustomField = async () => {
    await navigate({
      to: "/custom-fields",
      replace: true,
      search: (prev) => ({
        ...prev,
        selected: undefined
      })
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

    let success = true
    for (const field of fields) {
      try {
        await deleteAssetCustomFieldDefinition(field.id)
      } catch (error) {
        success = false
        toastActionError(
          error,
          `Failed to delete custom field ${field.name}: ${error}`
        )
        console.error(error)
      }
    }

    await queryClient.invalidateQueries({
      queryKey: createListAssetCustomFieldDefinitionsQueryOptions().queryKey
    })

    if (selected && fields.some((field) => field.id === selected)) {
      await handleClearSelectedCustomField()
    }

    if (success) {
      toast.success(`Deleted ${fields.length} custom field(s)!`)
    }
  }

  return (
    <>
      <AssetCustomFieldTable
        query={customFieldsQuery}
        selectedCustomFieldId={selected}
        filterState={filterState}
        onFilterStateChange={handleFilterStateChange}
        onSelectCustomField={(field) => {
          void handleSelectCustomField(field)
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
        selectedId={selected}
        title="Custom field details"
        description="Preview asset custom field configuration."
        fullPageHref={selected ? `/custom-fields/${selected}` : undefined}
        onClose={() => {
          void handleClearSelectedCustomField()
        }}
      >
        {selected ? (
          <AssetCustomFieldDetailContent customFieldId={selected} />
        ) : null}
      </DetailPreviewDialog>
    </>
  )
}
