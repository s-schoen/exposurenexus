import { VulnerabilitySeverity } from "@exposurenexus/contracts/model/vulnerability";

import { capitalizeFirstLetter } from "@/lib/format.ts";

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

export function formatSeverity(severity: VulnerabilitySeverity): string {
  return capitalizeFirstLetter(severity);
}

export function severityBadgeClass(severity: VulnerabilitySeverity): string {
  return severityBadgeClasses[severity];
}

export function severityChartColor(severity: VulnerabilitySeverity): string {
  return severityChartColors[severity];
}
