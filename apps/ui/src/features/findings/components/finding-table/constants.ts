import { FindingStatus } from "@exposurenexus/contracts/model/finding";
import { VulnerabilitySeverity } from "@exposurenexus/contracts/model/vulnerability";

export const SEVERITY_ORDER: Array<VulnerabilitySeverity> = [
  VulnerabilitySeverity.Critical,
  VulnerabilitySeverity.High,
  VulnerabilitySeverity.Medium,
  VulnerabilitySeverity.Low,
  VulnerabilitySeverity.Info,
];

export const STATUS_ORDER: Array<FindingStatus> = [
  FindingStatus.Active,
  FindingStatus.Confirmed,
  FindingStatus.Inactive,
  FindingStatus.FalsePositive,
  FindingStatus.RiskAccepted,
  FindingStatus.Duplicate,
  FindingStatus.OutOfScope,
  FindingStatus.Mitigated,
];
