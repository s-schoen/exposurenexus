import { Link } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypeRaw from "rehype-raw"
import { useCallback, useMemo } from "react"
import { FindingStatus } from "@openvlp/types/model/finding"
import { VulnerabilitySeverity } from "@openvlp/types/model/vulnerability"
import {
  Copy,
  ExternalLink,
  FileCode2,
  FileText,
  ShieldAlert
} from "lucide-react"
import { toast } from "sonner"
import type { ReactNode } from "react"
import type { Finding } from "@openvlp/types/model/finding"
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
import { UserLabel, createUserProfileById } from "@/components/user-label.tsx"
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

export function FindingDetailContent({
  findingId,
  titleAction
}: FindingDetailContentProps) {
  const finding = useQuery(createFindingByIDQueryOptions(findingId))
  const users = useQuery(createListUsersQueryOptions())
  const { updateFindingField } = useFindingLifecycle()
  const displayData = finding.data
  const asset = useQuery({
    ...createAssetByIDQueryOptions(displayData?.assetId ?? ""),
    enabled: Boolean(displayData?.assetId)
  })
  const userProfileById = useMemo(
    () => createUserProfileById(users.data),
    [users.data]
  )

  const handleUpdate = useCallback(
    async <TKey extends FindingEditableField>(
      key: TKey,
      value: Finding[TKey]
    ) => {
      if (!finding.data) return

      await updateFindingField(finding.data, key, value)
    },
    [finding.data, updateFindingField]
  )

  const handleCopyEvidence = useCallback(async () => {
    if (!finding.data?.evidence) return

    try {
      await navigator.clipboard.writeText(finding.data.evidence)
      toast.success("Evidence copied")
    } catch (error) {
      console.error("Error copying evidence:", error)
      toast.error("Failed to copy evidence")
    }
  }, [finding.data?.evidence])

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

  function AssigneeLabel({ className }: { className?: string }) {
    return (
      <UserLabel
        userId={displayData!.assigneeId}
        user={
          displayData!.assigneeId && users.isPending
            ? undefined
            : displayData!.assigneeId
              ? (userProfileById.get(displayData!.assigneeId) ?? null)
              : null
        }
        emptyLabel="Unassigned"
        unknownLabel="Unknown Assignee"
        className={className}
      />
    )
  }

  function CardPlaceholder() {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Finding details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    )
  }

  function FindingOverviewCard() {
    return (
      <Card className="border-border/60 bg-shell-panel shadow-(--shell-shadow)">
        <CardHeader className="gap-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">{titleAction}</div>
            <div className="flex items-center gap-2">
              <SeverityBadge
                severity={displayData!.severity}
                className="h-6 px-2.5 text-xs"
              />
              <FindingStatusBadge
                status={displayData!.status}
                className="h-6 px-2.5 text-xs"
              />
            </div>
          </div>
          <div className="space-y-3">
            <div className="space-y-2">
              <CardTitle className="text-2xl font-semibold tracking-tight">
                {displayData!.vulnerability.title}
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
                label="Responsible owner"
                value={<ResponsibleOwnerLabel />}
                description="Derived from the affected asset"
              />
              <DetailHighlightCard
                label="Source"
                value={displayData!.source}
                description="Imported or created finding origin"
              />
              <DetailHighlightCard
                label="First seen"
                value={formatDateTime(displayData!.firstSeen)}
                description="Earliest observed occurrence"
              />
              <DetailHighlightCard
                label="Last seen"
                value={formatDateTime(displayData!.lastSeen)}
                description="Most recent observed occurrence"
              />
            </div>
          </div>
        </CardHeader>
      </Card>
    )
  }

  function FindingSidebar() {
    return (
      <MetadataSidebar title="Assessment" icon={ShieldAlert}>
        <div className="space-y-4">
          <MetadataDetailRow
            label="Severity"
            editable={{
              value: displayData!.severity,
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
              onSave: (value) => handleUpdate("severity", value)
            }}
          />
          <MetadataDetailRow
            label="Status"
            editable={{
              value: displayData!.status,
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
              onSave: (value) => handleUpdate("status", value)
            }}
          />
          <MetadataDetailRow
            label="Source"
            editable={{
              value: displayData!.source,
              editElement: { type: "input" },
              editOnClick: true,
              showEditIcon: false,
              onSave: (value) => handleUpdate("source", value)
            }}
          />
        </div>
        <Separator />
        <div className="space-y-3">
          <MetadataDetailRow
            label="Created by"
            value={<UserLabel userId={displayData!.createdBy} />}
          />
          <MetadataDetailRow
            label="Updated by"
            value={<UserLabel userId={displayData!.updatedBy} />}
          />
          <MetadataDetailRow
            label="Asset"
            value={asset.data?.name ?? "Unknown asset"}
          />
          <MetadataDetailRow
            label="Responsible owner"
            value={<ResponsibleOwnerLabel />}
          />
          <MetadataDetailRow label="Assignee" value={<AssigneeLabel />} />
          <MetadataDetailRow
            label="Asset type"
            value={capitalizeFirstLetter(asset.data?.type ?? "Unknown")}
          />
          <MetadataDetailRow
            label="Created"
            value={formatDateTime(displayData!.createdAt)}
          />
          <MetadataDetailRow
            label="Updated"
            value={formatDateTime(displayData!.updatedAt)}
          />
        </div>
      </MetadataSidebar>
    )
  }

  function VulnerabilityCard() {
    return (
      <Card className="w-full border-border/60 bg-shell-panel shadow-(--shell-shadow)">
        <CardHeader className="gap-3">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <Badge variant="outline" className="rounded-md">
                Vulnerability reference
              </Badge>
              <CardTitle className="text-xl font-semibold">
                {finding.data?.vulnerability.title}
              </CardTitle>
            </div>
            <CardAction>
              <Link
                to="/vulnerabilities/$id"
                params={{ id: finding.data?.vulnerability.id ?? "" }}
                disabled={finding.isLoading}
              >
                <Button variant="ghost" size="icon-sm" className="rounded-xl">
                  <ExternalLink className="text-accent-foreground" size={20} />
                </Button>
              </Link>
            </CardAction>
          </div>
          <CardDescription>
            <SeverityBadge
              severity={
                finding.data?.vulnerability.severity ??
                VulnerabilitySeverity.Info
              }
            />
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <DetailHighlightCard
              label="Vulnerability severity"
              value={
                <SeverityBadge
                  severity={
                    finding.data?.vulnerability.severity ??
                    VulnerabilitySeverity.Info
                  }
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
            <Markdown>{finding.data?.vulnerability.description ?? ""}</Markdown>
          </div>
        </CardContent>
      </Card>
    )
  }

  function EvidenceCard() {
    const evidence = finding.data?.evidence?.trim() ?? ""
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
              onClick={handleCopyEvidence}
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

  return finding.isPending ? (
    <CardPlaceholder />
  ) : (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex min-w-0 flex-col gap-4">
        <FindingOverviewCard />
        <AssetInfoItem assetId={displayData?.assetId ?? ""} />
        <VulnerabilityCard />
        <EvidenceCard />
      </div>
      <FindingSidebar />
    </div>
  )
}
