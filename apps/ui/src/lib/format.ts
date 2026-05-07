import { FindingStatus } from "@exposurenexus/types/model/finding"
import type { VulnerabilitySeverity } from "@exposurenexus/types/model/vulnerability"

export function capitalizeFirstLetter(val: string) {
  return String(val).charAt(0).toUpperCase() + String(val).slice(1)
}

export function formatFindingStatus(status: FindingStatus) {
  switch (status) {
    case FindingStatus.Active:
      return "Active"
    case FindingStatus.Confirmed:
      return "Confirmed"
    case FindingStatus.Duplicate:
      return "Duplicate"
    case FindingStatus.FalsePositive:
      return "False Positive"
    case FindingStatus.Inactive:
      return "Inactive"
    case FindingStatus.Mitigated:
      return "Mitigated"
    case FindingStatus.OutOfScope:
      return "Out of Scope"
    case FindingStatus.RiskAccepted:
      return "Risk Accepted"
    default:
      return ""
  }
}

export function formatSeverity(severity: VulnerabilitySeverity) {
  return capitalizeFirstLetter(severity)
}

export function formatDate(date: Date) {
  return date.toLocaleDateString()
}
