import { VulnerabilitySeverity } from "@openvlp/types/model/vulnerability"

export function severityColor(
  severity: VulnerabilitySeverity,
  bg: boolean = true
): string {
  let color = ""
  switch (severity) {
    case VulnerabilitySeverity.Info:
      color = "blue-700"
      break
    case VulnerabilitySeverity.Low:
      color = "yellow-600"
      break
    case VulnerabilitySeverity.Medium:
      color = "orange-600"
      break
    case VulnerabilitySeverity.High:
      color = "red-600"
      break
    case VulnerabilitySeverity.Critical:
      color = "pink-800"
  }

  return bg ? `bg-${color}` : color
}
