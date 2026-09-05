import { useQuery } from "@tanstack/react-query";

import { DetailQueryBoundary } from "@/components/detail-query-boundary.tsx";
import { createAssetByIDQueryOptions } from "@/features/assets";
import { FindingDetailContent } from "@/features/findings/components/finding-detail-content.tsx";
import { createFindingByIDQueryOptions } from "@/features/findings/queries/findings.ts";

export function FindingPreview({ findingId }: { findingId: string }) {
  const finding = useQuery(createFindingByIDQueryOptions(findingId));
  const asset = useQuery({
    ...createAssetByIDQueryOptions(finding.data?.assetId ?? ""),
    enabled: Boolean(finding.data?.assetId),
  });

  return (
    <DetailQueryBoundary
      query={finding}
      title="Finding details"
      errorTitle="Unable to load finding"
      errorDescription="The selected finding could not be loaded."
      missingMessage="The API did not return a finding record."
    >
      {(findingData) => (
        <DetailQueryBoundary
          query={asset}
          title="Finding details"
          errorTitle="Unable to load asset"
          errorDescription="The selected finding's asset could not be loaded."
          missingMessage="The API did not return an asset record."
        >
          {(assetData) => <FindingDetailContent finding={findingData} asset={assetData} />}
        </DetailQueryBoundary>
      )}
    </DetailQueryBoundary>
  );
}
