import { Badge } from "@/components/ui/badge.tsx";
import { findingStatusBadgeClass } from "@/lib/colors.ts";
import { formatFindingStatus } from "@/lib/format.ts";
import { cn } from "@/lib/utils.ts";

import type { FindingStatus } from "@exposurenexus/contracts/model/finding";

interface FindingStatusBadgeProps {
  status: FindingStatus;
  className?: string;
}

export function FindingStatusBadge({ status, className }: FindingStatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn("rounded-md border font-medium", findingStatusBadgeClass(status), className)}
    >
      {formatFindingStatus(status)}
    </Badge>
  );
}
