import { FindingStatus } from "@exposurenexus/types/model/finding"
import { Badge } from "@/components/ui/badge.tsx"
import { formatFindingStatus } from "@/lib/format.ts"
import { cn } from "@/lib/utils.ts"

interface FindingStatusBadgeProps {
  status: FindingStatus
  className?: string
}

function statusClassName(status: FindingStatus) {
  switch (status) {
    case FindingStatus.Active:
      return "border-red-200 bg-red-50 text-red-700"
    case FindingStatus.Confirmed:
      return "border-orange-200 bg-orange-50 text-orange-700"
    case FindingStatus.Mitigated:
      return "border-emerald-200 bg-emerald-50 text-emerald-700"
    case FindingStatus.FalsePositive:
      return "border-slate-200 bg-slate-100 text-slate-700"
    case FindingStatus.RiskAccepted:
      return "border-amber-200 bg-amber-50 text-amber-700"
    case FindingStatus.Duplicate:
      return "border-zinc-200 bg-zinc-100 text-zinc-700"
    case FindingStatus.OutOfScope:
      return "border-sky-200 bg-sky-50 text-sky-700"
    case FindingStatus.Inactive:
      return "border-neutral-200 bg-neutral-100 text-neutral-700"
    default:
      return "border-border bg-muted text-foreground"
  }
}

export function FindingStatusBadge({
  status,
  className
}: FindingStatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "rounded-md border font-medium",
        statusClassName(status),
        className
      )}
    >
      {formatFindingStatus(status)}
    </Badge>
  )
}
