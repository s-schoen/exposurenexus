import { useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Plus, Tags } from "lucide-react";
import { lazy, Suspense, useMemo } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog.tsx";
import { DetailPreviewDialog } from "@/components/detail-preview-dialog.tsx";
import { CustomFieldList } from "@/features/custom-fields/components/custom-field-list/index.tsx";
import { useAssetCustomFieldDefinitionLifecycle } from "@/features/custom-fields/hooks/use-asset-custom-field-definition-lifecycle.ts";
import { useCustomFieldTableSearchState } from "@/features/custom-fields/hooks/use-custom-field-table-search-state.ts";
import { createListAssetCustomFieldDefinitionsQueryOptions } from "@/features/custom-fields/queries/definitions.ts";
import { usePageMeta } from "@/hooks/use-page-meta.tsx";
import { useSelectedSearchParam } from "@/hooks/use-selected-search-param.ts";

import type { AssetCustomFieldDefinition } from "@exposurenexus/contracts/model/asset-custom-field";

const CustomFieldPreview = lazy(() =>
  import("@/features/custom-fields/components/custom-field-preview.tsx").then((module) => ({
    default: module.CustomFieldPreview,
  })),
);

interface CustomFieldsPageProps {
  search?: Record<string, unknown>;
  selected?: string;
}

export function CustomFieldsPage({ search = {}, selected }: CustomFieldsPageProps) {
  const navigate = useNavigate();
  const fieldLifecycle = useAssetCustomFieldDefinitionLifecycle();
  const { filterState, onFilterStateChange } = useCustomFieldTableSearchState({
    search,
  });
  const selectedSearch = useSelectedSearchParam<AssetCustomFieldDefinition>({
    selectedId: selected,
    to: "/settings/custom-fields",
    replace: true,
    getId: (field) => field.id,
  });
  const customFieldsQuery = useSuspenseQuery(createListAssetCustomFieldDefinitionsQueryOptions());

  const actions = useMemo(
    () => [
      {
        label: "New custom field",
        icon: Plus,
        onClick: () => {
          void navigate({ to: "/settings/custom-fields/new" });
        },
      },
    ],
    [navigate],
  );

  usePageMeta({
    title: "Custom Fields",
    icon: Tags,
    count: customFieldsQuery.data.length,
    actions,
  });

  const handleOpenCustomField = async (field: AssetCustomFieldDefinition) => {
    await navigate({
      to: "/settings/custom-fields/$id",
      params: { id: field.id },
    });
  };

  const handleDeleteCustomFields = async (fields: Array<AssetCustomFieldDefinition>) => {
    const confirmed = await ConfirmDialog.call({
      title: "Delete Custom Fields",
      description: "This action cannot be undone",
      message: `Are you sure you want to delete ${fields.length} custom field(s)?`,
      confirmVariant: "destructive",
    });

    if (!confirmed) {
      return;
    }

    const result = await fieldLifecycle.deleteDefinitions(fields);
    const deletedFieldIds = new Set(result.successful.map((field) => field.id));

    if (selected && deletedFieldIds.has(selected)) {
      await selectedSearch.clearSelected();
    }
  };

  return (
    <>
      <CustomFieldList
        query={customFieldsQuery}
        selectedCustomFieldId={selectedSearch.selectedId}
        filterState={filterState}
        onFilterStateChange={onFilterStateChange}
        onSelectCustomField={(field) => {
          void selectedSearch.selectRow(field);
        }}
        onOpenCustomField={(field) => {
          void handleOpenCustomField(field);
        }}
        onCreateCustomField={() => {
          void navigate({ to: "/settings/custom-fields/new" });
        }}
        onDeleteCustomFields={handleDeleteCustomFields}
      />
      <DetailPreviewDialog
        selectedId={selectedSearch.selectedId}
        title="Custom field details"
        description="Preview asset custom field configuration."
        fullPageHref={selected ? `/settings/custom-fields/${selected}` : undefined}
        onClose={() => {
          void selectedSearch.clearSelected();
        }}
      >
        {selected ? (
          <Suspense fallback={null}>
            <CustomFieldPreview customFieldId={selected} />
          </Suspense>
        ) : null}
      </DetailPreviewDialog>
    </>
  );
}
