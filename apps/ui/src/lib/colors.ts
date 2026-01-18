import { FindingSeverity } from "@openvlp/types/model/finding"

export function severityColor(
  severity: FindingSeverity,
  bg: boolean = true
): string {
  let color = ""
  switch (severity) {
    case FindingSeverity.Info:
      color = "blue-700"
      break
    case FindingSeverity.Low:
      color = "yellow-600"
      break
    case FindingSeverity.Medium:
      color = "orange-600"
      break
    case FindingSeverity.High:
      color = "red-600"
      break
    case FindingSeverity.Critical:
      color = "bg-pink-800"
  }

  return bg ? `bg-${color}` : color
}
