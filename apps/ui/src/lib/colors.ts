import { VulnerabilitySeverity } from "@openvlp/types/model/vulnerability"

export function severityColor(
  severity: VulnerabilitySeverity,
  bg: boolean = true
): string {
  let color = ""
  switch (severity) {
    case VulnerabilitySeverity.Info:
      color = bg ? "bg-blue-700" : "blue-700"
      break
    case VulnerabilitySeverity.Low:
      color = bg ? "bg-yellow-600" : "yellow-600"
      break
    case VulnerabilitySeverity.Medium:
      color = bg ? "bg-orange-600" : "orange-600"
      break
    case VulnerabilitySeverity.High:
      color = bg ? "bg-red-600" : "red-600"
      break
    case VulnerabilitySeverity.Critical:
      color = bg ? "bg-pink-800" : "pink-800"
  }

  return color
}
