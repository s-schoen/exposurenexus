import { useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Plus, Tags } from "lucide-react";
import { lazy, useMemo } from "react";

import { DetailPeek } from "@/components/detail-peek.tsx";
import { CustomFieldList } from "@/features/custom-fields/components/custom-field-list/index.tsx";
import { useCreateCustomField } from "@/features/custom-fields/hooks/use-create-custom-field.ts";
import { useDeleteCustomFields } from "@/features/custom-fields/hooks/use-custom-field-record-actions.ts";
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
const CustomFieldPeekMenu = lazy(() =>
  import("@/features/custom-fields/components/custom-field-preview.tsx").then((module) => ({
    default: module.CustomFieldPeekMenu,
  })),
);

interface CustomFieldsPageProps {
  search?: Record<string, unknown>;
  selected?: string;
}

export function CustomFieldsPage({ search = {}, selected }: CustomFieldsPageProps) {
  const navigate = useNavigate();
  const createCustomField = useCreateCustomField();
  const deleteCustomFields = useDeleteCustomFields();
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
          void createCustomField();
        },
      },
    ],
    [createCustomField],
  );

  usePageMeta({
    title: "Custom fields",
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
          void createCustomField();
        }}
        onDeleteCustomFields={deleteCustomFields}
      />
      <DetailPeek
        selectedId={selectedSearch.selectedId}
        label="Custom field details"
        getFullPageHref={(id) => `/settings/custom-fields/${id}`}
        menu={(id) => <CustomFieldPeekMenu customFieldId={id} />}
        onClose={() => {
          void selectedSearch.clearSelected();
        }}
      >
        {(id) => <CustomFieldPreview customFieldId={id} />}
      </DetailPeek>
    </>
  );
}
