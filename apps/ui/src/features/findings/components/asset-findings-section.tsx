import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { DetailList, DetailListItem } from "@/components/properties-panel/detail-rows.tsx";
import { DetailSection } from "@/components/properties-panel/detail-section.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { FindingStatusBadge } from "@/features/findings/components/finding-status-badge.tsx";
import { createListFindingsQueryOptions } from "@/features/findings/queries/findings.ts";
import { SEVERITY_ORDER, SeverityIcon } from "@/features/vulnerabilities";

import type { Finding } from "@exposurenexus/contracts/model/finding";
import type { ReactNode } from "react";

function bySeverity(left: Finding, right: Finding) {
  return SEVERITY_ORDER.indexOf(left.severity) - SEVERITY_ORDER.indexOf(right.severity);
}

/** The findings on one asset, most severe first, as a section of the asset detail. */
export function AssetFindingsSection({ assetId }: { assetId: string }) {
  const findings = useQuery({
    ...createListFindingsQueryOptions(),
    select: (data) => data.filter((finding) => finding.assetId === assetId).sort(bySeverity),
  });

  let content: ReactNode;
  if (findings.isPending) {
    content = (
      <div className="flex flex-col gap-2" aria-label="Findings loading">
        <Skeleton className="h-7 w-full" />
        <Skeleton className="h-7 w-3/4" />
      </div>
    );
  } else if (findings.isError) {
    content = <p className="text-13 text-destructive">Unable to load findings.</p>;
  } else if (findings.data.length === 0) {
    content = <p className="text-13 text-subtle-foreground">No findings on this asset.</p>;
  } else {
    content = (
      <DetailList label="Findings">
        {findings.data.map((finding) => (
          <DetailListItem
            key={finding.id}
            trailing={<FindingStatusBadge status={finding.status} />}
          >
            <SeverityIcon severity={finding.severity} />
            <Link
              to="/findings/$id"
              params={{ id: finding.id }}
              className="min-w-0 flex-1 truncate font-medium hover:underline"
            >
              {finding.title}
            </Link>
          </DetailListItem>
        ))}
      </DetailList>
    );
  }

  return (
    <DetailSection title="Findings" count={findings.data?.length}>
      {content}
    </DetailSection>
  );
}
