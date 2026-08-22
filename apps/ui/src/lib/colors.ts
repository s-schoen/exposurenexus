import { FindingStatus } from "@exposurenexus/contracts/model/finding";
import { VulnerabilitySeverity } from "@exposurenexus/contracts/model/vulnerability";

const severityBadgeClasses = {
  [VulnerabilitySeverity.Info]:
    "border-[oklch(0.84_0.028_228)] bg-[oklch(0.97_0.01_220)] text-[oklch(0.4_0.03_232)] dark:border-[oklch(0.46_0.035_228)] dark:bg-[oklch(0.26_0.018_245)] dark:text-[oklch(0.82_0.03_220)]",
  [VulnerabilitySeverity.Low]:
    "border-[oklch(0.85_0.036_102)] bg-[oklch(0.975_0.012_102)] text-[oklch(0.45_0.045_102)] dark:border-[oklch(0.48_0.04_102)] dark:bg-[oklch(0.27_0.018_102)] dark:text-[oklch(0.84_0.042_102)]",
  [VulnerabilitySeverity.Medium]:
    "border-[oklch(0.8_0.085_72)] bg-[oklch(0.96_0.03_72)] text-[oklch(0.46_0.115_66)] dark:border-[oklch(0.56_0.08_72)] dark:bg-[oklch(0.31_0.04_72)] dark:text-[oklch(0.87_0.085_72)]",
  [VulnerabilitySeverity.High]:
    "border-[oklch(0.74_0.11_32)] bg-[oklch(0.94_0.05_28)] text-[oklch(0.44_0.16_28)] dark:border-[oklch(0.58_0.1_28)] dark:bg-[oklch(0.33_0.055_28)] dark:text-[oklch(0.86_0.11_28)]",
  [VulnerabilitySeverity.Critical]:
    "border-[oklch(0.68_0.13_12)] bg-[oklch(0.92_0.07_12)] text-[oklch(0.38_0.17_12)] dark:border-[oklch(0.6_0.12_12)] dark:bg-[oklch(0.34_0.07_12)] dark:text-[oklch(0.84_0.13_12)]",
} satisfies Record<VulnerabilitySeverity, string>;

const severityChartColors = {
  [VulnerabilitySeverity.Info]: "var(--color-blue-700)",
  [VulnerabilitySeverity.Low]: "var(--color-yellow-600)",
  [VulnerabilitySeverity.Medium]: "var(--color-orange-600)",
  [VulnerabilitySeverity.High]: "var(--color-red-600)",
  [VulnerabilitySeverity.Critical]: "var(--color-pink-800)",
} satisfies Record<VulnerabilitySeverity, string>;

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

export function severityBadgeClass(severity: VulnerabilitySeverity): string {
  return severityBadgeClasses[severity];
}

export function severityChartColor(severity: VulnerabilitySeverity): string {
  return severityChartColors[severity];
}

export function findingStatusBadgeClass(status: FindingStatus): string {
  return findingStatusBadgeClasses[status];
}

export function findingStatusChartColor(status: FindingStatus): string {
  return findingStatusChartColors[status];
}
