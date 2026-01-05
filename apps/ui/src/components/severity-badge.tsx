import { FindingSeverity } from "@openvlp/types/model/finding"
import { formatSeverity } from "@/lib/format.ts"
import { Badge } from "@/components/ui/badge.tsx"
import { cn } from "@/lib/utils.ts"
import { severityColor } from "@/lib/colors.ts"

interface SeverityBadgeProps {
  severity: FindingSeverity
  className?: string
}

export function SeverityBadge({ severity, className }: SeverityBadgeProps) {
  return (
    <Badge className={cn("rounded-md", severityColor(severity), className)}>
      {formatSeverity(severity)}
    </Badge>
  )
}
