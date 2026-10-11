import { useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Tags } from "lucide-react";

import {
  AssetCustomFieldForm,
  mapAssetCustomFieldDefinitionToFormValues,
  mapUpdateAssetCustomFieldFormValues,
} from "@/features/custom-fields/components/asset-custom-field-form.tsx";
import { useAssetCustomFieldDefinitionLifecycle } from "@/features/custom-fields/hooks/use-asset-custom-field-definition-lifecycle.ts";
import { createAssetCustomFieldDefinitionByIDQueryOptions } from "@/features/custom-fields/queries/definitions.ts";
import { usePageMeta } from "@/hooks/use-page-meta.tsx";

interface EditCustomFieldPageProps {
  customFieldId: string;
}

export function EditCustomFieldPage({ customFieldId }: EditCustomFieldPageProps) {
  const navigate = useNavigate();
  const fieldLifecycle = useAssetCustomFieldDefinitionLifecycle();
  const customField = useSuspenseQuery(
    createAssetCustomFieldDefinitionByIDQueryOptions(customFieldId),
  );

  usePageMeta({
    title: "Edit",
    icon: Tags,
    breadcrumbs: [
      { label: "Custom fields", to: "/settings/custom-fields" },
      { label: customField.data.name, to: `/settings/custom-fields/${customFieldId}` },
    ],
  });

  const handleCancel = async () => {
    await navigate({
      to: "/settings/custom-fields/$id",
      params: { id: customFieldId },
    });
  };

  const handleSubmit = async (
    values: Parameters<typeof mapUpdateAssetCustomFieldFormValues>[0],
  ) => {
    const updatedCustomField = await fieldLifecycle.updateDefinition(
      customFieldId,
      mapUpdateAssetCustomFieldFormValues(values),
    );

    if (updatedCustomField) {
      await navigate({
        to: "/settings/custom-fields/$id",
        params: { id: customFieldId },
      });
    }
  };

  return (
    <AssetCustomFieldForm
      mode="edit"
      defaultValues={mapAssetCustomFieldDefinitionToFormValues(customField.data)}
      onSubmit={handleSubmit}
      onCancel={handleCancel}
    />
  );
}
