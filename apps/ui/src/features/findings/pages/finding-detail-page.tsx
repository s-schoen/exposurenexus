import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { buttonVariants } from "@/components/ui/button.tsx";
import { createAssetByIDQueryOptions } from "@/features/assets";
import { FindingDetailContent } from "@/features/findings/components/finding-detail-content.tsx";
import { formatFindingStatus } from "@/features/findings/lib/format.ts";
import { createFindingByIDQueryOptions } from "@/features/findings/queries/findings.ts";
import { usePageMeta } from "@/hooks/use-page-meta.tsx";
import { cn } from "@/lib/utils.ts";

interface FindingDetailPageProps {
  findingId: string;
}

export function FindingDetailPage({ findingId }: FindingDetailPageProps) {
  const finding = useQuery(createFindingByIDQueryOptions(findingId));
  const asset = useQuery({
    ...createAssetByIDQueryOptions(finding.data?.assetId ?? ""),
    enabled: Boolean(finding.data?.assetId),
  });

  usePageMeta({
    title: finding.data?.title ?? "Finding",
    description:
      asset.data?.displayName && finding.data
        ? `${formatFindingStatus(finding.data.status)} finding on ${asset.data.displayName}`
        : "Inspect, update, and triage a specific finding.",
  });

  return (
    <FindingDetailContent
      findingId={findingId}
      titleAction={
        <Link
          to="/findings"
          search={{
            filter: undefined,
            severity: undefined,
            status: undefined,
            assignee: undefined,
            selected: undefined,
          }}
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2 rounded-xl")}
        >
          <ArrowLeft />
          Back to findings
        </Link>
      }
    />
  );
}
