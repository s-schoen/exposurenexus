import { Link } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypeRaw from "rehype-raw"
import { useCallback, useMemo, useState } from "react"
import { FindingStatus } from "@exposurenexus/types/model/finding"
import { normalizeDateToUtcStart } from "@exposurenexus/types/model/date"
import { VulnerabilitySeverity } from "@exposurenexus/types/model/vulnerability"
import {
  Copy,
  ExternalLink,
  FileCode2,
  FileText,
  ShieldAlert,
  X
} from "lucide-react"
import { toast } from "sonner"
import type { ReactNode } from "react"
import type { Finding } from "@exposurenexus/types/model/finding"
import type { FindingEditableField } from "@/hooks/use-finding-lifecycle.ts"
import { createFindingByIDQueryOptions } from "@/api/finding.ts"
import { createAssetByIDQueryOptions } from "@/api/asset.ts"
import { createListUsersQueryOptions } from "@/api/user.ts"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card.tsx"
import { DetailQueryBoundary } from "@/components/detail-query-boundary.tsx"
import { Skeleton } from "@/components/ui/skeleton.tsx"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area.tsx"
import { SeverityBadge } from "@/components/severity-badge.tsx"
import {
  capitalizeFirstLetter,
  formatFindingStatus,
  formatSeverity
} from "@/lib/format.ts"
import { AssetInfoItem } from "@/components/asset-info-item.tsx"
import { Button } from "@/components/ui/button.tsx"
import { Separator } from "@/components/ui/separator.tsx"
import { Badge } from "@/components/ui/badge.tsx"
import { FindingStatusBadge } from "@/components/finding-status-badge.tsx"
import { DetailHighlightCard } from "@/components/detail-highlight-card.tsx"
import { MetadataSidebar } from "@/components/metadata-sidebar"
import { MetadataDetailRow } from "@/components/metadata-sidebar/metadata-detail-row.tsx"
import {
  UserLabel,
  createUserProfileById,
  formatUserProfileReference
} from "@/components/user-label.tsx"
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover.tsx"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from "@/components/ui/command.tsx"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from "@/components/ui/tabs.tsx"
import { useFindingLifecycle } from "@/hooks/use-finding-lifecycle.ts"

interface FindingDetailContentProps {
  findingId: string
  titleAction?: ReactNode
}

const unassignedAssigneeValue = "__unassigned_assignee__"

function formatDateOnly(value: Date | null | undefined) {
  if (!value) return "No due date"

  return normalizeDateToUtcStart(value).toISOString().slice(0, 10)
}

function parseDateInputValue(value: string) {
  if (!value) return null

  return normalizeDateToUtcStart(new Date(`${value}T00:00:00.000Z`))
}

export function FindingDetailContent({
  findingId,
  titleAction
}: FindingDetailContentProps) {
  const finding = useQuery(createFindingByIDQueryOptions(findingId))
  const users = useQuery(createListUsersQueryOptions())
  const { updateFindingField } = useFindingLifecycle()
  const asset = useQuery({
    ...createAssetByIDQueryOptions(finding.data?.assetId ?? ""),
    enabled: Boolean(finding.data?.assetId)
  })
  const userProfileById = useMemo(
    () => createUserProfileById(users.data),
    [users.data]
  )

  const handleUpdate = useCallback(
    async <TKey extends FindingEditableField>(
      findingData: Finding,
      key: TKey,
      value: Finding[TKey]
    ) => {
      await updateFindingField(findingData, key, value)
    },
    [updateFindingField]
  )

  const handleCopyEvidence = useCallback(async (evidence: string) => {
    if (!evidence) return
    try {
      await navigator.clipboard.writeText(evidence)
      toast.success("Evidence copied")
    } catch (error) {
      console.error("Error copying evidence:", error)
      toast.error("Failed to copy evidence")
    }
  }, [])

  function formatDateTime(value: Date | null | undefined) {
    if (!value) return "Not available"

    return value.toLocaleString()
  }

  function ResponsibleOwnerLabel({ className }: { className?: string }) {
    if (asset.isPending) {
      return <Skeleton className="inline-flex h-4 w-24" />
    }

    if (!asset.data) {
      return <span className="text-muted-foreground">Unknown Asset</span>
    }

    return (
      <UserLabel
        userId={asset.data.ownerId}
        user={
          asset.data.ownerId && users.isPending
            ? undefined
            : asset.data.ownerId
              ? (userProfileById.get(asset.data.ownerId) ?? null)
              : null
        }
        emptyLabel="No Owner"
        unknownLabel="Unknown Owner"
        className={className}
      />
    )
  }

  function AssigneeLabel({
    findingData,
    className
  }: {
    findingData: Finding
    className?: string
  }) {
    return (
      <UserLabel
        userId={findingData.assigneeId}
        user={
          findingData.assigneeId && users.isPending
            ? undefined
            : findingData.assigneeId
              ? (userProfileById.get(findingData.assigneeId) ?? null)
              : null
        }
        emptyLabel="Unassigned"
        unknownLabel="Unknown Assignee"
        className={className}
      />
    )
  }

  function getAssigneeEditValue(findingData: Finding) {
    return findingData.assigneeId ?? unassignedAssigneeValue
  }

  function AssigneePicker({
    value,
    onCancel,
    onCommit
  }: {
    value: string
    onCancel: () => void
    onCommit: (value: string) => void
  }) {
    const [open, setOpen] = useState(false)
    const assigneeId = value === unassignedAssigneeValue ? null : value
    const assigneeLabel =
      assigneeId && users.isPending
        ? "Loading assignee"
        : formatUserProfileReference(assigneeId, userProfileById, {
            emptyLabel: "Unassigned",
            unknownLabel: "Unknown Assignee"
          })

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label="Finding assignee"
              disabled={users.isPending}
              className="max-w-full min-w-36 justify-between"
            >
              <span className="min-w-0 truncate">{assigneeLabel}</span>
            </Button>
          }
        />
        <PopoverContent align="end" className="w-72 p-0">
          <Command>
            <CommandInput placeholder="Search assignees..." />
            <CommandList>
              <CommandEmpty>No assignees found</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  value={unassignedAssigneeValue}
                  onSelect={() => {
                    setOpen(false)
                    onCommit(unassignedAssigneeValue)
                  }}
                >
                  Unassigned
                </CommandItem>
                {users.data?.map((user) => (
                  <CommandItem
                    key={user.id}
                    value={`${user.displayName} ${user.username}`}
                    onSelect={() => {
                      setOpen(false)
                      onCommit(user.id)
                    }}
                  >
                    <div className="min-w-0">
                      <span className="block truncate">{user.displayName}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {user.username}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Cancel finding assignee edit"
          title="Cancel"
          onClick={onCancel}
        >
          <X />
        </Button>
      </Popover>
    )
  }

  async function handleSaveAssignee(findingData: Finding, value: string) {
    const assigneeId = value === unassignedAssigneeValue ? null : value

    await handleUpdate(findingData, "assigneeId", assigneeId)
  }

  async function handleSaveDueDate(findingData: Finding, value: string) {
    await handleUpdate(findingData, "dueDate", parseDateInputValue(value))
  }

  function FindingOverviewCard({ findingData }: { findingData: Finding }) {
    return (
      <Card className="border-border/60 bg-shell-panel shadow-(--shell-shadow)">
        <CardHeader className="gap-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">{titleAction}</div>
            <div className="flex items-center gap-2">
              <SeverityBadge
                severity={findingData.severity}
                className="h-6 px-2.5 text-xs"
              />
              <FindingStatusBadge
                status={findingData.status}
                className="h-6 px-2.5 text-xs"
              />
            </div>
          </div>
          <div className="space-y-3">
            <div className="space-y-2">
              <CardTitle className="text-2xl font-semibold tracking-tight">
                {findingData.vulnerability.title}
              </CardTitle>
              <CardDescription className="max-w-3xl text-sm leading-6">
                Review the affected asset, validate the evidence, and update the
                triage state from the action panel.
              </CardDescription>
            </div>
            <div className="grid gap-3 xl:grid-cols-6">
              <DetailHighlightCard
                label="Affected asset"
                value={asset.data?.name ?? "Unknown asset"}
                description={capitalizeFirstLetter(
                  asset.data?.type ?? "Unclassified"
                )}
              />
              <DetailHighlightCard
                label="Asset owner"
                value={<ResponsibleOwnerLabel />}
                description="Derived from the affected asset"
              />
              <DetailHighlightCard
                label="Source"
                value={findingData.source}
                description="Imported or created finding origin"
              />
              <DetailHighlightCard
                label="First seen"
                value={formatDateTime(findingData.firstSeen)}
                description="Earliest observed occurrence"
              />
              <DetailHighlightCard
                label="Last seen"
                value={formatDateTime(findingData.lastSeen)}
                description="Most recent observed occurrence"
              />
            </div>
          </div>
        </CardHeader>
      </Card>
    )
  }

  function FindingSidebar({ findingData }: { findingData: Finding }) {
    return (
      <MetadataSidebar title="Assessment" icon={ShieldAlert}>
        <div className="space-y-4">
          <MetadataDetailRow
            label="Severity"
            editable={{
              value: findingData.severity,
              displayElement: (severityValue) => (
                <SeverityBadge
                  severity={severityValue}
                  className="h-7 px-3 text-sm"
                />
              ),
              editElement: {
                type: "select",
                options: Object.values(VulnerabilitySeverity).map((v) => ({
                  label: formatSeverity(v),
                  value: v
                }))
              },
              editOnClick: true,
              showEditIcon: false,
              onSave: (value) => handleUpdate(findingData, "severity", value)
            }}
          />
          <MetadataDetailRow
            label="Status"
            editable={{
              value: findingData.status,
              displayElement: (statusValue) => (
                <FindingStatusBadge
                  status={statusValue}
                  className="h-7 px-3 text-sm"
                />
              ),
              editElement: {
                type: "select",
                options: Object.values(FindingStatus).map((v) => ({
                  label: formatFindingStatus(v),
                  value: v
                }))
              },
              editOnClick: true,
              showEditIcon: false,
              onSave: (value) => handleUpdate(findingData, "status", value)
            }}
          />
          <MetadataDetailRow
            label="Source"
            editable={{
              value: findingData.source,
              editElement: { type: "input" },
              editOnClick: true,
              showEditIcon: false,
              onSave: (value) => handleUpdate(findingData, "source", value)
            }}
          />
          <MetadataDetailRow
            label="Due Date"
            editable={{
              value: formatDateOnly(findingData.dueDate),
              displayElement: () => (
                <span
                  className={
                    findingData.dueDate ? undefined : "text-muted-foreground"
                  }
                >
                  {formatDateOnly(findingData.dueDate)}
                </span>
              ),
              editElement: { type: "input", inputType: "date" },
              editOnClick: true,
              showEditIcon: false,
              onSave: (value) => handleSaveDueDate(findingData, value)
            }}
          />
        </div>
        <Separator />
        <div className="space-y-3">
          <MetadataDetailRow
            label="Created by"
            value={<UserLabel userId={findingData.createdBy} />}
          />
          <MetadataDetailRow
            label="Updated by"
            value={<UserLabel userId={findingData.updatedBy} />}
          />
          <MetadataDetailRow
            label="Asset"
            value={asset.data?.name ?? "Unknown asset"}
          />
          <MetadataDetailRow
            label="Asset owner"
            value={<ResponsibleOwnerLabel />}
          />
          <MetadataDetailRow
            label="Assignee"
            editable={{
              value: getAssigneeEditValue(findingData),
              onSave: (value) => handleSaveAssignee(findingData, value),
              displayElement: () => <AssigneeLabel findingData={findingData} />,
              editElement: {
                type: "custom",
                hideActions: true,
                render: ({ value, onCancel, onCommit }) => (
                  <AssigneePicker
                    value={value}
                    onCancel={onCancel}
                    onCommit={onCommit}
                  />
                )
              },
              editOnClick: true,
              showEditIcon: false
            }}
          />
          <MetadataDetailRow
            label="Asset type"
            value={capitalizeFirstLetter(asset.data?.type ?? "Unknown")}
          />
          <MetadataDetailRow
            label="Created"
            value={formatDateTime(findingData.createdAt)}
          />
          <MetadataDetailRow
            label="Updated"
            value={formatDateTime(findingData.updatedAt)}
          />
        </div>
      </MetadataSidebar>
    )
  }

  function VulnerabilityCard({ findingData }: { findingData: Finding }) {
    return (
      <Card className="w-full border-border/60 bg-shell-panel shadow-(--shell-shadow)">
        <CardHeader className="gap-3">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <Badge variant="outline" className="rounded-md">
                Vulnerability reference
              </Badge>
              <CardTitle className="text-xl font-semibold">
                {findingData.vulnerability.title}
              </CardTitle>
            </div>
            <CardAction>
              <Link
                to="/vulnerabilities/$id"
                params={{ id: findingData.vulnerability.id }}
                disabled={finding.isLoading}
              >
                <Button variant="ghost" size="icon-sm" className="rounded-xl">
                  <ExternalLink className="text-accent-foreground" size={20} />
                </Button>
              </Link>
            </CardAction>
          </div>
          <CardDescription>
            <SeverityBadge severity={findingData.vulnerability.severity} />
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <DetailHighlightCard
              label="Vulnerability severity"
              value={
                <SeverityBadge
                  severity={findingData.vulnerability.severity}
                  className="h-7 px-3 text-sm"
                />
              }
              description="Canonical severity from the linked vulnerability record"
            />
            <DetailHighlightCard
              label="Description"
              value="Reference context"
              description="Canonical vulnerability record linked to this finding."
            />
          </div>
          <div className="prose prose-sm max-w-none text-foreground prose-headings:text-foreground prose-p:text-muted-foreground prose-strong:text-foreground prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5">
            <Markdown>{findingData.vulnerability.description ?? ""}</Markdown>
          </div>
        </CardContent>
      </Card>
    )
  }

  function EvidenceCard({ findingData }: { findingData: Finding }) {
    const evidence = findingData.evidence?.trim() ?? ""
    const hasEvidence = evidence.length > 0

    return (
      <Card className="w-full border-border/60 bg-shell-panel shadow-(--shell-shadow)">
        <CardHeader className="gap-3">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <CardTitle className="text-xl font-semibold">Evidence</CardTitle>
              <CardDescription>
                Scanner output, validation notes, and technical proof supporting
                this finding.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl"
              disabled={!hasEvidence}
              onClick={() => handleCopyEvidence(evidence)}
            >
              <Copy />
              Copy evidence
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {hasEvidence ? (
            <Tabs defaultValue="rendered" className="gap-4">
              <TabsContent value="rendered">
                <TabsList variant="line" className="mb-3 rounded-none p-0">
                  <TabsTrigger
                    value="rendered"
                    className="gap-2 rounded-xl px-3"
                  >
                    <FileText />
                    Rendered
                  </TabsTrigger>
                  <TabsTrigger value="raw" className="gap-2 rounded-xl px-3">
                    <FileCode2 />
                    Raw
                  </TabsTrigger>
                </TabsList>
                <ScrollArea className="w-full rounded-2xl border border-border/70 bg-muted/20">
                  <div className="min-w-full p-5">
                    <div className="prose prose-sm max-w-none text-foreground prose-headings:text-foreground prose-p:max-w-3xl prose-p:text-muted-foreground prose-li:text-muted-foreground prose-a:text-primary prose-blockquote:border-l-border prose-blockquote:text-muted-foreground prose-pre:overflow-x-auto prose-pre:rounded-xl prose-pre:border prose-pre:border-border prose-pre:bg-card prose-pre:px-4 prose-pre:py-4 prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-table:w-full prose-table:border-collapse prose-th:border-b prose-th:border-border prose-th:px-3 prose-th:py-2 prose-th:text-left prose-td:border-b prose-td:border-border/60 prose-td:px-3 prose-td:py-2 prose-td:align-top">
                      <Markdown
                        remarkPlugins={[remarkGfm]}
                        rehypePlugins={[rehypeRaw]}
                      >
                        {evidence}
                      </Markdown>
                    </div>
                  </div>
                  <ScrollBar orientation="horizontal" />
                </ScrollArea>
              </TabsContent>
              <TabsContent value="raw">
                <TabsList variant="line" className="mb-3 rounded-none p-0">
                  <TabsTrigger
                    value="rendered"
                    className="gap-2 rounded-xl px-3"
                  >
                    <FileText />
                    Rendered
                  </TabsTrigger>
                  <TabsTrigger value="raw" className="gap-2 rounded-xl px-3">
                    <FileCode2 />
                    Raw
                  </TabsTrigger>
                </TabsList>
                <ScrollArea className="w-full rounded-2xl border border-border/70 bg-zinc-950 text-zinc-50">
                  <pre className="min-w-full p-5 text-xs leading-6 whitespace-pre-wrap">
                    <code>{evidence}</code>
                  </pre>
                  <ScrollBar orientation="horizontal" />
                </ScrollArea>
              </TabsContent>
            </Tabs>
          ) : (
            <div className="rounded-2xl border border-dashed border-border bg-background/60 p-8 text-center">
              <div className="text-sm font-medium text-foreground">
                No evidence available
              </div>
              <div className="mt-2 text-sm text-muted-foreground">
                This finding does not include validation notes or scanner output
                yet.
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <DetailQueryBoundary
      query={finding}
      title="Finding details"
      errorTitle="Unable to load finding"
      errorDescription="The selected finding could not be loaded."
      missingMessage="The API did not return a finding record."
    >
      {(findingData) => (
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="flex min-w-0 flex-col gap-4">
            <FindingOverviewCard findingData={findingData} />
            <AssetInfoItem assetId={findingData.assetId} />
            <VulnerabilityCard findingData={findingData} />
            <EvidenceCard findingData={findingData} />
          </div>
          <FindingSidebar findingData={findingData} />
        </div>
      )}
    </DetailQueryBoundary>
  )
}
