import { useQuery } from "@tanstack/react-query";

import { DetailQueryBoundary } from "@/components/detail-query-boundary.tsx";
import { RecordMenu } from "@/components/record-menu.tsx";
import { createAssetByIDQueryOptions } from "@/features/assets";
import { FindingDetailContent } from "@/features/findings/components/finding-detail-content.tsx";
import { useFindingRecordActions } from "@/features/findings/hooks/use-finding-record-actions.tsx";
import { createFindingByIDQueryOptions } from "@/features/findings/queries/findings.ts";

import type { Finding } from "@exposurenexus/contracts/model/finding";

function FindingRecordMenu({ finding }: { finding: Finding }) {
  const { actions, dialog } = useFindingRecordActions(finding);

  return (
    <>
      <RecordMenu actions={actions} />
      {dialog}
    </>
  );
}

/** The peek header's ⋯ menu. It waits for the preview's fetch instead of fetching again. */
export function FindingPeekMenu({ findingId }: { findingId: string }) {
  const finding = useQuery({ ...createFindingByIDQueryOptions(findingId), enabled: false });

  return finding.data ? <FindingRecordMenu finding={finding.data} /> : null;
}

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
