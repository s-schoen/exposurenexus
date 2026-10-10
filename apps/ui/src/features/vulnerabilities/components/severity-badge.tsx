import { VulnerabilitySeverity } from "@exposurenexus/contracts/model/vulnerability";

import { Badge } from "@/components/ui/badge.tsx";
import { formatSeverity } from "@/features/vulnerabilities/lib/severity.ts";
import { cn } from "@/lib/utils.ts";

const severityClasses = {
  [VulnerabilitySeverity.Info]:
    "border-severity-info/30 bg-severity-info/10 text-severity-info dark:bg-severity-info/15",
  [VulnerabilitySeverity.Low]:
    "border-severity-low/30 bg-severity-low/10 text-severity-low dark:bg-severity-low/15",
  [VulnerabilitySeverity.Medium]:
    "border-severity-medium/30 bg-severity-medium/10 text-severity-medium dark:bg-severity-medium/15",
  [VulnerabilitySeverity.High]:
    "border-severity-high/30 bg-severity-high/10 text-severity-high dark:bg-severity-high/15",
  [VulnerabilitySeverity.Critical]:
    "border-severity-critical/30 bg-severity-critical/10 text-severity-critical dark:bg-severity-critical/15",
} satisfies Record<VulnerabilitySeverity, string>;

interface SeverityBadgeProps {
  severity: VulnerabilitySeverity;
  size?: "default" | "lg";
  className?: string;
}

export function SeverityBadge({ severity, size = "default", className }: SeverityBadgeProps) {
  return (
    <Badge
      variant="outline"
      size={size}
      className={cn("rounded-md", severityClasses[severity], className)}
    >
      {formatSeverity(severity)}
    </Badge>
  );
}
