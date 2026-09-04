import { FindingStatus } from "@exposurenexus/contracts/model/finding";

const findingStatusBadgeClasses = {
  [FindingStatus.Active]: "border-red-200 bg-red-50 text-red-700",
  [FindingStatus.Confirmed]: "border-orange-200 bg-orange-50 text-orange-700",
  [FindingStatus.Mitigated]: "border-emerald-200 bg-emerald-50 text-emerald-700",
  [FindingStatus.FalsePositive]: "border-slate-200 bg-slate-100 text-slate-700",
  [FindingStatus.RiskAccepted]: "border-amber-200 bg-amber-50 text-amber-700",
  [FindingStatus.Duplicate]: "border-zinc-200 bg-zinc-100 text-zinc-700",
  [FindingStatus.OutOfScope]: "border-sky-200 bg-sky-50 text-sky-700",
  [FindingStatus.Inactive]: "border-neutral-200 bg-neutral-100 text-neutral-700",
} satisfies Record<FindingStatus, string>;

const findingStatusChartColors = {
  [FindingStatus.Active]: "var(--color-red-700)",
  [FindingStatus.Confirmed]: "var(--color-orange-600)",
  [FindingStatus.Mitigated]: "var(--color-emerald-600)",
  [FindingStatus.FalsePositive]: "var(--color-slate-600)",
  [FindingStatus.RiskAccepted]: "var(--color-amber-600)",
  [FindingStatus.Duplicate]: "var(--color-zinc-600)",
  [FindingStatus.OutOfScope]: "var(--color-sky-600)",
  [FindingStatus.Inactive]: "var(--color-neutral-600)",
} satisfies Record<FindingStatus, string>;

export function findingStatusBadgeClass(status: FindingStatus): string {
  return findingStatusBadgeClasses[status];
}

export function findingStatusChartColor(status: FindingStatus): string {
  return findingStatusChartColors[status];
}
