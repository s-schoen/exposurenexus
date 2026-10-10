import { FindingStatus } from "@exposurenexus/contracts/model/finding";

import { Badge } from "@/components/ui/badge.tsx";
import { formatFindingStatus } from "@/features/findings/lib/format.ts";
import { cn } from "@/lib/utils.ts";

const findingStatusClasses = {
  [FindingStatus.Active]:
    "border-finding-status-active/30 bg-finding-status-active/10 text-finding-status-active dark:bg-finding-status-active/15",
  [FindingStatus.Confirmed]:
    "border-finding-status-confirmed/30 bg-finding-status-confirmed/10 text-finding-status-confirmed dark:bg-finding-status-confirmed/15",
  [FindingStatus.Mitigated]:
    "border-finding-status-mitigated/30 bg-finding-status-mitigated/10 text-finding-status-mitigated dark:bg-finding-status-mitigated/15",
  [FindingStatus.FalsePositive]:
    "border-finding-status-false-positive/30 bg-finding-status-false-positive/10 text-finding-status-false-positive dark:bg-finding-status-false-positive/15",
  [FindingStatus.RiskAccepted]:
    "border-finding-status-risk-accepted/30 bg-finding-status-risk-accepted/10 text-finding-status-risk-accepted dark:bg-finding-status-risk-accepted/15",
  [FindingStatus.Duplicate]:
    "border-finding-status-duplicate/30 bg-finding-status-duplicate/10 text-finding-status-duplicate dark:bg-finding-status-duplicate/15",
  [FindingStatus.OutOfScope]:
    "border-finding-status-out-of-scope/30 bg-finding-status-out-of-scope/10 text-finding-status-out-of-scope dark:bg-finding-status-out-of-scope/15",
  [FindingStatus.Inactive]:
    "border-finding-status-inactive/30 bg-finding-status-inactive/10 text-finding-status-inactive dark:bg-finding-status-inactive/15",
} satisfies Record<FindingStatus, string>;

interface FindingStatusBadgeProps {
  status: FindingStatus;
  size?: "default" | "lg";
  className?: string;
}

export function FindingStatusBadge({
  status,
  size = "default",
  className,
}: FindingStatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      size={size}
      className={cn("rounded-md", findingStatusClasses[status], className)}
    >
      {formatFindingStatus(status)}
    </Badge>
  );
}
