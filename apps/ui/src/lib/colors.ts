import { FindingSeverity } from "@openvlp/types/model/finding"

export function severityColor(severity: FindingSeverity): string {
  switch (severity) {
    case FindingSeverity.Info:
      return "bg-blue-700"
    case FindingSeverity.Low:
      return "bg-yellow-600"
    case FindingSeverity.Medium:
      return "bg-orange-600"
    case FindingSeverity.High:
      return "bg-red-600"
    case FindingSeverity.Critical:
      return "bg-pink-800"
  }
}
