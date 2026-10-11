import { FindingStatus } from "@exposurenexus/contracts/model/finding";

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
