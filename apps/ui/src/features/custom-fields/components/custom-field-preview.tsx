import { useQuery } from "@tanstack/react-query";

import { DetailQueryBoundary } from "@/components/detail-query-boundary.tsx";
import { RecordMenu } from "@/components/record-menu.tsx";
import { AssetCustomFieldDetailContent } from "@/features/custom-fields/components/asset-custom-field-detail-content.tsx";
import { useCustomFieldRecordActions } from "@/features/custom-fields/hooks/use-custom-field-record-actions.ts";
import { createAssetCustomFieldDefinitionByIDQueryOptions } from "@/features/custom-fields/queries/definitions.ts";

import type { AssetCustomFieldDefinition } from "@exposurenexus/contracts/model/asset-custom-field";

function CustomFieldRecordMenu({ field }: { field: AssetCustomFieldDefinition }) {
  return <RecordMenu actions={useCustomFieldRecordActions(field)} />;
}

/** The peek header's ⋯ menu. It waits for the preview's fetch instead of fetching again. */
export function CustomFieldPeekMenu({ customFieldId }: { customFieldId: string }) {
  const query = useQuery({
    ...createAssetCustomFieldDefinitionByIDQueryOptions(customFieldId),
    enabled: false,
  });

  return query.data ? <CustomFieldRecordMenu field={query.data} /> : null;
}

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
