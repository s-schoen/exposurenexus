import { useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Pencil, Tags } from "lucide-react";
import { useMemo } from "react";

import { AssetCustomFieldDetailContent } from "@/features/custom-fields/components/asset-custom-field-detail-content";
import { createAssetCustomFieldDefinitionByIDQueryOptions } from "@/features/custom-fields/queries/definitions.ts";
import { usePageMeta } from "@/hooks/use-page-meta.tsx";

interface CustomFieldDetailPageProps {
  customFieldId: string;
}

export function CustomFieldDetailPage({ customFieldId }: CustomFieldDetailPageProps) {
  const navigate = useNavigate();
  const customField = useSuspenseQuery(
    createAssetCustomFieldDefinitionByIDQueryOptions(customFieldId),
  );
  const actions = useMemo(() => {
    return [
      {
        label: "Edit custom field",
        icon: Pencil,
        onClick: () => {
          void navigate({
            to: "/settings/custom-fields/$id/edit",
            params: { id: customFieldId },
          });
        },
      },
    ];
  }, [customFieldId, navigate]);

  usePageMeta({
    title: customField.data.name,
    icon: Tags,
    breadcrumbs: [{ label: "Custom Fields", to: "/settings/custom-fields" }],
    actions,
  });

  return <AssetCustomFieldDetailContent field={customField.data} />;
}
