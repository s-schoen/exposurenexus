import { Badge } from "@/components/ui/badge.tsx";
import { SeverityIcon } from "@/features/vulnerabilities/components/severity-icon.tsx";
import { formatSeverity } from "@/features/vulnerabilities/lib/severity.ts";

import type { VulnerabilitySeverity } from "@exposurenexus/contracts/model/vulnerability";

interface SeverityBadgeProps {
  severity: VulnerabilitySeverity;
  size?: "default" | "lg";
  className?: string;
}

export function SeverityBadge({ severity, size = "default", className }: SeverityBadgeProps) {
  return (
    <Badge variant="property" size={size} className={className}>
      <SeverityIcon severity={severity} decorative />
      {formatSeverity(severity)}
    </Badge>
  );
}
