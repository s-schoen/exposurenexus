import {
  CustomFieldDefinitionCard,
  CustomFieldOverviewCard,
  SelectOptionsCard,
} from "@/features/custom-fields/components/asset-custom-field-detail-content/detail-cards.tsx";
import { summarizeCustomField } from "@/features/custom-fields/components/asset-custom-field-detail-content/helpers.ts";
import { CustomFieldSidebar } from "@/features/custom-fields/components/asset-custom-field-detail-content/sidebar.tsx";

import type { AssetCustomFieldDefinition } from "@exposurenexus/contracts/model/asset-custom-field";
import type { ReactNode } from "react";

interface AssetCustomFieldDetailContentProps {
  field: AssetCustomFieldDefinition;
  titleAction?: ReactNode;
}

export function AssetCustomFieldDetailContent({
  field,
  titleAction,
}: AssetCustomFieldDetailContentProps) {
  const summary = summarizeCustomField(field);

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex min-w-0 flex-col gap-4">
        <CustomFieldOverviewCard field={field} summary={summary} titleAction={titleAction} />
        <CustomFieldDefinitionCard field={field} summary={summary} />
        <SelectOptionsCard field={field} />
      </div>
      <CustomFieldSidebar field={field} summary={summary} />
    </div>
  );
}
