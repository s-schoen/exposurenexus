import { Badge } from "@/components/ui/badge.tsx";
import { SeverityLabel } from "@/features/vulnerabilities/components/severity-label.tsx";

import type { VulnerabilitySeverity } from "@exposurenexus/contracts/model/vulnerability";

interface SeverityBadgeProps {
  severity: VulnerabilitySeverity;
  size?: "default" | "lg";
  className?: string;
}

export function SeverityBadge({ severity, size = "default", className }: SeverityBadgeProps) {
  return (
    <Badge variant="property" size={size} className={className}>
      <SeverityLabel severity={severity} />
    </Badge>
  );
}
