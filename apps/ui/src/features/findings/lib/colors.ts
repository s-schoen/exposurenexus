import { FindingStatus } from "@exposurenexus/contracts/model/finding";

const findingStatusChartColors = {
  [FindingStatus.Active]: "var(--color-finding-status-active)",
  [FindingStatus.Confirmed]: "var(--color-finding-status-confirmed)",
  [FindingStatus.Mitigated]: "var(--color-finding-status-mitigated)",
  [FindingStatus.FalsePositive]: "var(--color-finding-status-false-positive)",
  [FindingStatus.RiskAccepted]: "var(--color-finding-status-risk-accepted)",
  [FindingStatus.Duplicate]: "var(--color-finding-status-duplicate)",
  [FindingStatus.OutOfScope]: "var(--color-finding-status-out-of-scope)",
  [FindingStatus.Inactive]: "var(--color-finding-status-inactive)",
} satisfies Record<FindingStatus, string>;

export function findingStatusChartColor(status: FindingStatus): string {
  return findingStatusChartColors[status];
}
