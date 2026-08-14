import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { CircleAlert } from "lucide-react";

import { createAssetCustomFieldDefinitionByIDQueryOptions } from "@/api/asset-custom-field.ts";
import {
  AssetCustomFieldForm,
  mapAssetCustomFieldDefinitionToFormValues,
  mapUpdateAssetCustomFieldFormValues,
} from "@/components/asset-custom-field-form.tsx";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { usePageMeta } from "@/context/page.tsx";
import { useAssetCustomFieldDefinitionLifecycle } from "@/hooks/use-asset-custom-field-definition-lifecycle.ts";

interface EditCustomFieldPageProps {
  customFieldId: string;
}

export function EditCustomFieldPage({ customFieldId }: EditCustomFieldPageProps) {
  const navigate = useNavigate();
  const fieldLifecycle = useAssetCustomFieldDefinitionLifecycle();
  const customField = useQuery(createAssetCustomFieldDefinitionByIDQueryOptions(customFieldId));

  usePageMeta({
    title: customField.data?.name ? `Edit ${customField.data.name}` : "Edit Custom Field",
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

  if (customField.isPending) {
    return (
      <Card className="border-border/60 bg-shell-panel shadow-(--shell-shadow)">
        <CardHeader>
          <CardTitle>Edit custom field</CardTitle>
          <CardDescription>Loading custom field details.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!customField.data) {
    return (
      <Card className="border-border/60 bg-shell-panel shadow-(--shell-shadow)">
        <CardHeader>
          <CardTitle>Edit custom field</CardTitle>
          <CardDescription>
            The selected custom field could not be loaded for editing.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>Unable to load edit form</AlertTitle>
            <AlertDescription>{customField.error.message}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <AssetCustomFieldForm
      mode="edit"
      defaultValues={mapAssetCustomFieldDefinitionToFormValues(customField.data)}
      onSubmit={handleSubmit}
      onCancel={handleCancel}
    />
  );
}
