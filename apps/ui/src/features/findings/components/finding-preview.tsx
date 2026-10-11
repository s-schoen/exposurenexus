import { useQuery } from "@tanstack/react-query";
import { Ellipsis, Pencil } from "lucide-react";
import { useState } from "react";

import { DetailQueryBoundary } from "@/components/detail-query-boundary.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { createAssetByIDQueryOptions } from "@/features/assets";
import { FindingDetailContent } from "@/features/findings/components/finding-detail-content.tsx";
import { FindingDetailsDialog } from "@/features/findings/components/finding-details-dialog.tsx";
import { createFindingByIDQueryOptions } from "@/features/findings/queries/findings.ts";

import type { Finding } from "@exposurenexus/contracts/model/finding";

// The peek has no page header, so its ⋯ menu sits beside the title.
function FindingPeekMenu({ finding }: { finding: Finding }) {
  const [editingDetails, setEditingDetails] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon" aria-label="More actions" />}
        >
          <Ellipsis strokeWidth={1.5} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setEditingDetails(true)}>
            <Pencil />
            Edit details
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <FindingDetailsDialog
        finding={finding}
        open={editingDetails}
        onOpenChange={setEditingDetails}
      />
    </>
  );
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
          {(assetData) => (
            <FindingDetailContent
              finding={findingData}
              asset={assetData}
              titleAction={<FindingPeekMenu finding={findingData} />}
            />
          )}
        </DetailQueryBoundary>
      )}
    </DetailQueryBoundary>
  );
}
