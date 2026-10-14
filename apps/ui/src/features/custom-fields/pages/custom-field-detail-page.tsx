import { useSuspenseQuery } from "@tanstack/react-query";
import { Tags } from "lucide-react";

import { AssetCustomFieldDetailContent } from "@/features/custom-fields/components/asset-custom-field-detail-content.tsx";
import { useCustomFieldRecordActions } from "@/features/custom-fields/hooks/use-custom-field-record-actions.ts";
import { createAssetCustomFieldDefinitionByIDQueryOptions } from "@/features/custom-fields/queries/definitions.ts";
import { usePageMeta } from "@/hooks/use-page-meta.tsx";

interface CustomFieldDetailPageProps {
  customFieldId: string;
}

export function CustomFieldDetailPage({ customFieldId }: CustomFieldDetailPageProps) {
  const customField = useSuspenseQuery(
    createAssetCustomFieldDefinitionByIDQueryOptions(customFieldId),
  );
  const actions = useCustomFieldRecordActions(customField.data);

  usePageMeta({
    title: customField.data.name,
    icon: Tags,
    breadcrumbs: [{ label: "Custom fields", to: "/settings/custom-fields" }],
    menu: actions,
  });

  return <AssetCustomFieldDetailContent field={customField.data} />;
}
