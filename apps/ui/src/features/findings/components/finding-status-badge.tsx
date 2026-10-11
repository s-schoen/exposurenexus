import { Badge } from "@/components/ui/badge.tsx";
import { FindingStatusIcon } from "@/features/findings/components/finding-status-icon.tsx";
import { formatFindingStatus } from "@/features/findings/lib/format.ts";

import type { FindingStatus } from "@exposurenexus/contracts/model/finding";

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
    <Badge variant="property" size={size} className={className}>
      <FindingStatusIcon status={status} decorative />
      {formatFindingStatus(status)}
    </Badge>
  );
}
