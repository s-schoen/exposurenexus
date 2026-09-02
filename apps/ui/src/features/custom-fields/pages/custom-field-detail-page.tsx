import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Pencil } from "lucide-react";
import { useMemo } from "react";

import { buttonVariants } from "@/components/ui/button.tsx";
import { AssetCustomFieldDetailContent } from "@/features/custom-fields/components/asset-custom-field-detail-content";
import { createAssetCustomFieldDefinitionByIDQueryOptions } from "@/features/custom-fields/queries/definitions.ts";
import { usePageMeta } from "@/hooks/use-page-meta.tsx";
import { cn } from "@/lib/utils.ts";

interface CustomFieldDetailPageProps {
  customFieldId: string;
}

export function CustomFieldDetailPage({ customFieldId }: CustomFieldDetailPageProps) {
  const navigate = useNavigate();
  const customField = useQuery(createAssetCustomFieldDefinitionByIDQueryOptions(customFieldId));
  const actions = useMemo(() => {
    if (!customField.data) {
      return [];
    }

    return [
      {
        label: "Edit custom field",
        icon: Pencil,
        onClick: () => {
          void navigate({
            to: "/custom-fields/$id/edit",
            params: { id: customFieldId },
          });
        },
      },
    ];
  }, [customField.data, customFieldId, navigate]);

  usePageMeta({
    title: customField.data?.name ?? "Custom Field",
    description: "Review asset custom field settings and allowed values.",
    actions,
  });

  return (
    <AssetCustomFieldDetailContent
      customFieldId={customFieldId}
      titleAction={
        <Link
          to="/custom-fields"
          search={(previous) => ({
            filter: previous.filter,
            type: previous.type,
            required: previous.required,
            selected: undefined,
          })}
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2 rounded-xl")}
        >
          <ArrowLeft />
          Back to custom fields
        </Link>
      }
    />
  );
}
