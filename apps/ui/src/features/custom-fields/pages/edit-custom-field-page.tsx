import { useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

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
    title: `Edit ${customField.data.name}`,
    description: "Update the asset custom field definition and allowed values.",
  });

  const handleCancel = async () => {
    await navigate({
      to: "/custom-fields/$id",
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
        to: "/custom-fields/$id",
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
