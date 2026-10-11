import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

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
      <ul className="flex flex-col">
        {findings.data.map((finding) => (
          <li
            key={finding.id}
            className="-mx-2 flex h-9 items-center gap-2 rounded-md px-2 transition-colors duration-100 hover:bg-accent"
          >
            <SeverityIcon severity={finding.severity} />
            <Link
              to="/findings/$id"
              params={{ id: finding.id }}
              className="min-w-0 flex-1 truncate text-13 font-medium text-foreground hover:underline"
            >
              {finding.title}
            </Link>
            <FindingStatusBadge status={finding.status} className="shrink-0" />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <DetailSection title="Findings" count={findings.data?.length}>
      {content}
    </DetailSection>
  );
}
