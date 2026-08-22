import { Badge } from "@/components/ui/badge.tsx";
import { severityBadgeClass } from "@/lib/colors.ts";
import { formatSeverity } from "@/lib/format.ts";
import { cn } from "@/lib/utils.ts";

import type { VulnerabilitySeverity } from "@exposurenexus/contracts/model/vulnerability";

interface SeverityBadgeProps {
  severity: VulnerabilitySeverity;
  className?: string;
}

export function SeverityBadge({ severity, className }: SeverityBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "rounded-md border px-2.5 font-medium shadow-none",
        severityBadgeClass(severity),
        className,
      )}
    >
      {formatSeverity(severity)}
    </Badge>
  );
}
