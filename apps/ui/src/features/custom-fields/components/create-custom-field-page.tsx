import { useNavigate } from "@tanstack/react-router";

import {
  AssetCustomFieldForm,
  mapAssetCustomFieldFormValues,
} from "@/components/asset-custom-field-form.tsx";
import { usePageMeta } from "@/context/page.tsx";
import { useAssetCustomFieldDefinitionLifecycle } from "@/hooks/use-asset-custom-field-definition-lifecycle.ts";

export function CreateCustomFieldPage() {
  const navigate = useNavigate();
  const fieldLifecycle = useAssetCustomFieldDefinitionLifecycle();

  usePageMeta({
    title: "Create Custom Field",
    description: "Define a new asset metadata field.",
  });

  const handleCancel = async () => {
    await navigate({
      to: "/custom-fields",
      search: (previous) => ({
        filter: previous.filter,
        type: previous.type,
        required: previous.required,
        selected: undefined,
      }),
    });
  };

  const handleSubmit = async (values: Parameters<typeof mapAssetCustomFieldFormValues>[0]) => {
    const payload = mapAssetCustomFieldFormValues(values);
    const customField = await fieldLifecycle.createDefinition(payload);

    if (customField) {
      await navigate({
        to: "/custom-fields/$id",
        params: { id: customField.id },
      });
    }
  };

  return <AssetCustomFieldForm mode="create" onSubmit={handleSubmit} onCancel={handleCancel} />;
}
