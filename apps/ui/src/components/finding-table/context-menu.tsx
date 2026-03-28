import * as React from "react"
import type { ReactElement } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Check } from "lucide-react"
import { FindingStatus } from "@openvlp/types/model/finding"
import { VulnerabilitySeverity } from "@openvlp/types/model/vulnerability"
import type { Finding } from "@openvlp/types/model/finding"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger
} from "@/components/ui/context-menu"
import { SeverityBadge } from "@/components/severity-badge"
import { formatFindingStatus } from "@/lib/format"
import { updateFinding, createListFindingsQueryOptions } from "@/api/finding"

const SEVERITY_ORDER: VulnerabilitySeverity[] = [
  VulnerabilitySeverity.Critical,
  VulnerabilitySeverity.High,
  VulnerabilitySeverity.Medium,
  VulnerabilitySeverity.Low,
  VulnerabilitySeverity.Info
]

const STATUS_ORDER: FindingStatus[] = [
  FindingStatus.Active,
  FindingStatus.Confirmed,
  FindingStatus.Inactive,
  FindingStatus.FalsePositive,
  FindingStatus.RiskAccepted,
  FindingStatus.Duplicate,
  FindingStatus.OutOfScope,
  FindingStatus.Mitigated
]

interface FindingContextMenuProps {
  findings: Finding[]
  onDelete: () => void
  children: ReactElement
}

export function FindingContextMenu({
  findings,
  onDelete,
  children
}: FindingContextMenuProps) {
  const queryClient = useQueryClient()

  const sharedSeverity =
    findings.length > 0 &&
    findings.every((f) => f.severity === findings[0].severity)
      ? findings[0].severity
      : null

  const sharedStatus =
    findings.length > 0 &&
    findings.every((f) => f.status === findings[0].status)
      ? findings[0].status
      : null

  const handleUpdate = async <K extends "severity" | "status">(
    key: K,
    value: Finding[K]
  ) => {
    let success = true
    for (const finding of findings) {
      try {
        await updateFinding({ ...finding, [key]: value })
      } catch (error) {
        success = false
        toast.error(`Failed to update finding ${finding.id}: ${error}`)
        console.error(error)
      }
    }
    if (success) {
      toast.success(`Updated ${findings.length} finding(s)`)
    }
    queryClient.invalidateQueries({
      queryKey: createListFindingsQueryOptions().queryKey
    })
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger render={children as React.ReactElement} />
      <ContextMenuContent className="w-48">
        <ContextMenuLabel>
          {findings.length} finding{findings.length !== 1 ? "s" : ""} selected
        </ContextMenuLabel>
        <ContextMenuSeparator />
        <ContextMenuSub>
          <ContextMenuSubTrigger>Set Status</ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-44">
            {STATUS_ORDER.map((status) => (
              <ContextMenuItem
                key={status}
                onSelect={() => handleUpdate("status", status)}
                className="flex items-center justify-between"
              >
                {formatFindingStatus(status)}
                {sharedStatus === status && (
                  <Check className="h-4 w-4 text-primary" />
                )}
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSub>
          <ContextMenuSubTrigger>Set Severity</ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-40">
            {SEVERITY_ORDER.map((severity) => (
              <ContextMenuItem
                key={severity}
                onSelect={() => handleUpdate("severity", severity)}
                className="flex items-center justify-between"
              >
                <SeverityBadge severity={severity} />
                {sharedSeverity === severity && (
                  <Check className="h-4 w-4 text-primary" />
                )}
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSeparator />
        <ContextMenuItem
          onSelect={onDelete}
          className="text-destructive focus:text-destructive"
        >
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
