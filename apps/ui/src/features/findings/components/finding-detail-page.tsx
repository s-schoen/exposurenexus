import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { createAssetByIDQueryOptions } from "@/api/asset.ts";
import { createFindingByIDQueryOptions } from "@/api/finding.ts";
import { FindingDetailContent } from "@/components/finding-detail-content.tsx";
import { buttonVariants } from "@/components/ui/button.tsx";
import { usePageMeta } from "@/context/page.tsx";
import { formatFindingStatus } from "@/lib/format.ts";
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
