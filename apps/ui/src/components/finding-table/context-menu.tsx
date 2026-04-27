import * as React from "react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Check } from "lucide-react"
import type { Finding } from "@openvlp/types/model/finding"
import type { ReactElement } from "react"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger
} from "@/components/ui/context-menu"
import { SeverityBadge } from "@/components/severity-badge"
import {
  SEVERITY_ORDER,
  STATUS_ORDER
} from "@/components/finding-table/constants"
import { formatFindingStatus } from "@/lib/format"
import { createListFindingsQueryOptions, updateFinding } from "@/api/finding"
import { toastActionError } from "@/lib/action-error-toast"

interface FindingContextMenuProps {
  findingsRef: React.RefObject<Array<Finding>>
  onDelete: () => void
  children: ReactElement
}

export function FindingContextMenu({
  findingsRef,
  onDelete,
  children
}: FindingContextMenuProps) {
  const queryClient = useQueryClient()
  const findings = findingsRef.current

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

  const handleUpdate = async <TKey extends "severity" | "status">(
    key: TKey,
    value: Finding[TKey]
  ) => {
    let success = true
    for (const finding of findings) {
      try {
        await updateFinding({ ...finding, [key]: value })
      } catch (error) {
        success = false
        toastActionError(
          error,
          `Failed to update finding ${finding.id}: ${error}`
        )
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
      <ContextMenuTrigger render={children} />
      <ContextMenuContent className="w-48">
        <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
          {findings.length} finding{findings.length !== 1 ? "s" : ""} selected
        </div>
        <ContextMenuSeparator />
        <ContextMenuSub>
          <ContextMenuSubTrigger>Set Status</ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-44">
            {STATUS_ORDER.map((status) => (
              <ContextMenuItem
                key={status}
                onClick={() => handleUpdate("status", status)}
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
                onClick={() => handleUpdate("severity", severity)}
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
          onClick={onDelete}
          className="text-destructive focus:text-destructive"
        >
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
