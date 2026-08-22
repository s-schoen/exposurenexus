import { ListChecks } from "lucide-react";

import { CustomFieldRequiredBadge } from "@/components/asset-custom-field-detail-content/detail-cards.tsx";
import { MetadataSidebar } from "@/components/metadata-sidebar";
import { MetadataDetailRow } from "@/components/metadata-sidebar/metadata-detail-row.tsx";

import type { CustomFieldSummary } from "@/components/asset-custom-field-detail-content/helpers.ts";
import type { AssetCustomFieldDefinition } from "@exposurenexus/contracts/model/asset-custom-field";

export function CustomFieldSidebar({
  field,
  summary,
}: {
  field: AssetCustomFieldDefinition;
  summary: CustomFieldSummary;
}) {
  return (
    <MetadataSidebar title="Custom field details" icon={ListChecks}>
      <div className="space-y-3">
        <MetadataDetailRow label="Name" value={field.name} />
        <MetadataDetailRow label="Key" value={field.key} mono />
        <MetadataDetailRow label="Type" value={summary.typeLabel} />
        <MetadataDetailRow
          label="Required"
          value={<CustomFieldRequiredBadge required={field.required} />}
        />
        <MetadataDetailRow label="Default" value={summary.defaultValue} />
        <MetadataDetailRow label="Options" value={summary.optionCount} />
      </div>
    </MetadataSidebar>
  );
}
