import { FindingStatus } from "@exposurenexus/contracts/model/finding";

import { formatCount } from "@/lib/format.ts";

export function formatFindingCount(count: number) {
  return formatCount(count, "finding");
}

export function formatFindingStatus(status: FindingStatus) {
  switch (status) {
    case FindingStatus.Active:
      return "Active";
    case FindingStatus.Confirmed:
      return "Confirmed";
    case FindingStatus.Duplicate:
      return "Duplicate";
    case FindingStatus.FalsePositive:
      return "False Positive";
    case FindingStatus.Inactive:
      return "Inactive";
    case FindingStatus.Mitigated:
      return "Mitigated";
    case FindingStatus.OutOfScope:
      return "Out of Scope";
    case FindingStatus.RiskAccepted:
      return "Risk Accepted";
    default:
      return "";
  }
}
