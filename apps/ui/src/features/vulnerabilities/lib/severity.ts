import { VulnerabilitySeverity } from "@exposurenexus/contracts/model/vulnerability";

import { capitalizeFirstLetter } from "@/lib/format.ts";

/** Most to least severe, the order of filter options and groups. */
export const SEVERITY_ORDER: Array<VulnerabilitySeverity> = [
  VulnerabilitySeverity.Critical,
  VulnerabilitySeverity.High,
  VulnerabilitySeverity.Medium,
  VulnerabilitySeverity.Low,
  VulnerabilitySeverity.Info,
];

const severityChartColors = {
  [VulnerabilitySeverity.Info]: "var(--color-severity-info)",
  [VulnerabilitySeverity.Low]: "var(--color-severity-low)",
  [VulnerabilitySeverity.Medium]: "var(--color-severity-medium)",
  [VulnerabilitySeverity.High]: "var(--color-severity-high)",
  [VulnerabilitySeverity.Critical]: "var(--color-severity-critical)",
} satisfies Record<VulnerabilitySeverity, string>;

export function formatSeverity(severity: VulnerabilitySeverity): string {
  return capitalizeFirstLetter(severity);
}

export function severityChartColor(severity: VulnerabilitySeverity): string {
  return severityChartColors[severity];
}
