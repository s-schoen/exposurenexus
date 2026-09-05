import { useQuery } from "@tanstack/react-query";

import { DetailQueryBoundary } from "@/components/detail-query-boundary.tsx";
import { AssetCustomFieldDetailContent } from "@/features/custom-fields/components/asset-custom-field-detail-content";
import { createAssetCustomFieldDefinitionByIDQueryOptions } from "@/features/custom-fields/queries/definitions.ts";

export function CustomFieldPreview({ customFieldId }: { customFieldId: string }) {
  const query = useQuery(createAssetCustomFieldDefinitionByIDQueryOptions(customFieldId));
  return (
    <DetailQueryBoundary
      query={query}
      title="Custom field details"
      errorTitle="Unable to load custom field"
      errorDescription="The selected custom field could not be loaded."
      missingMessage="The API did not return a custom field record."
    >
      {(field) => <AssetCustomFieldDetailContent field={field} />}
    </DetailQueryBoundary>
  );
}
