import { Link, createFileRoute } from "@tanstack/react-router"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypeRaw from "rehype-raw"
import { useCallback } from "react"
import { FindingStatus } from "@openvlp/types/model/finding"
import { VulnerabilitySeverity } from "@openvlp/types/model/vulnerability"
import {
  ArrowLeft,
  Copy,
  ExternalLink,
  FileCode2,
  FileText,
  ShieldAlert
} from "lucide-react"
import { toast } from "sonner"
import type { Finding } from "@openvlp/types/model/finding"
import { createFindingByIDQueryOptions, updateFinding } from "@/api/finding.ts"
import { createAssetByIDQueryOptions } from "@/api/asset.ts"
import { usePageMeta } from "@/context/page.tsx"
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
import { Inplace } from "@/components/inplace.tsx"
import {
  formatFindingStatus,
  formatSeverity,
  capitalizeFirstLetter
} from "@/lib/format.ts"
import { AssetInfoItem } from "@/components/asset-info-item.tsx"
import { Button, buttonVariants } from "@/components/ui/button.tsx"
import { Separator } from "@/components/ui/separator.tsx"
import { Badge } from "@/components/ui/badge.tsx"
import { FindingStatusBadge } from "@/components/finding-status-badge.tsx"
import { cn } from "@/lib/utils.ts"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from "@/components/ui/tabs.tsx"

export const Route = createFileRoute("/_authenticated/findings/$id")({
  component: RouteComponent
})

function RouteComponent() {
  const { id } = Route.useParams()
  const finding = useQuery(createFindingByIDQueryOptions(id))
  const queryClient = useQueryClient()
  const displayData = finding.data
  const asset = useQuery({
    ...createAssetByIDQueryOptions(displayData?.assetId ?? ""),
    enabled: Boolean(displayData?.assetId)
  })

  const handleUpdate = useCallback(
    async <TKey extends keyof Finding>(key: TKey, value: Finding[TKey]) => {
      if (!finding.data || finding.data[key] === value) return

      const nextFinding = { ...finding.data, [key]: value }

      try {
        queryClient.setQueryData(["findings", id], nextFinding)
        await updateFinding(nextFinding)
        await queryClient.invalidateQueries({ queryKey: ["findings", id] })
      } catch (error) {
        queryClient.setQueryData(["findings", id], finding.data)
        console.error("Error updating finding:", error)
        toast.error("Failed to update finding")
      }
    },
    [finding.data, id, queryClient]
  )

  usePageMeta({
    title: finding.data?.vulnerability.title ?? "Finding",
    description:
      asset.data?.name && finding.data
        ? `${formatFindingStatus(displayData?.status ?? finding.data.status)} finding on ${asset.data.name}`
        : "Inspect, update, and triage a specific finding."
  })

  function formatDateTime(value: Date | null | undefined) {
    if (!value) return "Not available"

    const date = value instanceof Date ? value : new Date(value)
    return date.toLocaleString()
  }

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

  function DetailRow({
    label,
    value,
    mono = false
  }: {
    label: string
    value: string
    mono?: boolean
  }) {
    return (
      <div className="flex items-start justify-between gap-6">
        <span className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
          {label}
        </span>
        <span
          className={
            mono
              ? "max-w-[16rem] truncate text-right font-mono text-xs text-foreground"
              : "max-w-[16rem] text-right text-sm text-foreground"
          }
        >
          {value}
        </span>
      </div>
    )
  }

  function FindingOverviewCard() {
    return (
      <Card className="border-border/60 bg-shell-panel shadow-(--shell-shadow)">
        <CardHeader className="gap-4">
          <div className="flex items-center justify-between gap-3">
            <Link
              to="/findings"
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "-ml-2 w-fit rounded-xl"
              )}
            >
              <ArrowLeft />
              Back to findings
            </Link>
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
            <div className="grid gap-3 xl:grid-cols-4">
              <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
                <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  Affected asset
                </div>
                <div className="mt-2 text-base font-semibold text-foreground">
                  {asset.data?.name ?? "Unknown asset"}
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {capitalizeFirstLetter(asset.data?.type ?? "Unclassified")}
                </div>
              </div>
              <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
                <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  Source
                </div>
                <div className="mt-2 text-base font-semibold text-foreground">
                  {displayData!.source}
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Imported or created finding origin
                </div>
              </div>
              <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
                <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  First seen
                </div>
                <div className="mt-2 text-base font-semibold text-foreground">
                  {formatDateTime(displayData!.firstSeen)}
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Earliest observed occurrence
                </div>
              </div>
              <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
                <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  Last seen
                </div>
                <div className="mt-2 text-base font-semibold text-foreground">
                  {formatDateTime(displayData!.lastSeen)}
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Most recent observed occurrence
                </div>
              </div>
            </div>
          </div>
        </CardHeader>
      </Card>
    )
  }

  function FindingSidebar() {
    return (
      <Card className="sticky top-0 min-w-80 border-border/60 bg-shell-panel shadow-(--shell-shadow)">
        <CardHeader className="gap-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg font-semibold">
                Assessment
              </CardTitle>
            </div>
            <ShieldAlert className="size-5 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-4">
            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Severity
              </h3>
              <Inplace
                value={displayData!.severity}
                displayElement={(severityValue) => (
                  <SeverityBadge
                    severity={severityValue}
                    className="h-7 px-3 text-sm"
                  />
                )}
                editElement={{
                  type: "select",
                  options: Object.values(VulnerabilitySeverity).map((v) => ({
                    label: formatSeverity(v),
                    value: v
                  }))
                }}
                showEditIcon={false}
                editOnClick={true}
                onSave={(value) => handleUpdate("severity", value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Status
              </h3>
              <Inplace
                value={displayData!.status}
                displayElement={(statusValue) => (
                  <FindingStatusBadge
                    status={statusValue}
                    className="h-7 px-3 text-sm"
                  />
                )}
                editElement={{
                  type: "select",
                  options: Object.values(FindingStatus).map((v) => ({
                    label: formatFindingStatus(v),
                    value: v
                  }))
                }}
                editOnClick={true}
                onSave={(value) => handleUpdate("status", value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Source
              </h3>
              <Inplace
                value={displayData!.source}
                editElement={{ type: "input" }}
                editOnClick={true}
                showEditIcon={false}
                onSave={(value) => handleUpdate("source", value)}
              />
            </div>
          </div>
          <Separator />
          <div className="space-y-3">
            <DetailRow
              label="Asset"
              value={asset.data?.name ?? "Unknown asset"}
            />
            <DetailRow
              label="Asset type"
              value={capitalizeFirstLetter(asset.data?.type ?? "Unknown")}
            />
            <DetailRow
              label="Created"
              value={formatDateTime(displayData!.createdAt)}
            />
            <DetailRow
              label="Updated"
              value={formatDateTime(displayData!.updatedAt)}
            />
          </div>
        </CardContent>
      </Card>
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
                className={cn(
                  buttonVariants({ variant: "ghost", size: "icon-sm" }),
                  "rounded-xl"
                )}
              >
                <ExternalLink className="text-accent-foreground" size={20} />
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
            <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
              <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Vulnerability severity
              </div>
              <div className="mt-2">
                <SeverityBadge
                  severity={
                    finding.data?.vulnerability.severity ??
                    VulnerabilitySeverity.Info
                  }
                  className="h-7 px-3 text-sm"
                />
              </div>
            </div>
            <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
              <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Description
              </div>
              <div className="mt-2 text-sm leading-6 text-muted-foreground">
                Canonical vulnerability record linked to this finding.
              </div>
            </div>
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
              <div className="flex items-center justify-end gap-3"></div>
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
