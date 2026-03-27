import { Link, createFileRoute } from "@tanstack/react-router"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypeRaw from "rehype-raw"
import { useEffect, useState } from "react"
import { FindingStatus } from "@openvlp/types/model/finding"
import { VulnerabilitySeverity } from "@openvlp/types/model/vulnerability"
import { ExternalLink, Save } from "lucide-react"
import { toast } from "sonner"
import type { Finding } from "@openvlp/types/model/finding"
import { createFindingByIDQueryOptions, updateFinding } from "@/api/finding.ts"
import { usePage } from "@/context/page.tsx"
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
import { formatFindingStatus, formatSeverity } from "@/lib/format.ts"
import { AssetInfoItem } from "@/components/asset-info-item.tsx"

export const Route = createFileRoute("/_authenticated/findings/$id")({
  component: RouteComponent
})

function RouteComponent() {
  const { id } = Route.useParams()
  const finding = useQuery(createFindingByIDQueryOptions(id))
  // local draft, null means no pending changes
  const [draft, setDraft] = useState<Finding | null>(null)
  const displayData = draft ?? finding.data

  function updateDraft<TKey extends keyof Finding>(
    key: TKey,
    value: Finding[TKey]
  ) {
    setDraft((prev) => ({ ...(prev ?? finding.data!), [key]: value }))
  }

  async function handleSave() {
    if (!draft) return

    try {
      await updateFinding(draft)
      await useQueryClient().invalidateQueries({ queryKey: ["findings", id] })
      setDraft(null)
      toast.success("Finding updated")
    } catch (error) {
      console.error("Error updating finding:", error)
      toast.error("Failed to update finding")
    }
  }

  const page = usePage()

  useEffect(() => {
    page.setTitle("Finding")
    page.setActions([
      {
        label: "Save",
        icon: Save,
        onClick: handleSave,
        variant: "default",
        disabled: draft === null
      }
    ])
    return () => {
      page.setTitle("")
      page.setActions([])
    }
  }, [draft])

  function CardPlaceholder() {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    )
  }

  function FindingSidebar() {
    return (
      <Card className="min-w-72">
        <CardContent>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <h3 className="text-accent-foreground">Severity</h3>
              <Inplace
                value={displayData!.severity}
                displayElement={(severityValue) => (
                  <SeverityBadge severity={severityValue} />
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
                onSave={(value) => updateDraft("severity", value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <h3 className="text-accent-foreground">Status</h3>
              <Inplace
                value={displayData!.status}
                displayElement={(statusValue) => (
                  <>{formatFindingStatus(statusValue)}</>
                )}
                editElement={{
                  type: "select",
                  options: Object.values(FindingStatus).map((v) => ({
                    label: formatFindingStatus(v),
                    value: v
                  }))
                }}
                editOnClick={true}
                onSave={(value) => updateDraft("status", value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <h3 className="text-accent-foreground">Source</h3>
              <Inplace
                value={displayData!.source}
                editElement={{ type: "input" }}
                editOnClick={true}
                showEditIcon={false}
                onSave={(value) => updateDraft("source", value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  function VulnerabilityCard() {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="font-bold">
            {finding.data?.vulnerability.title}
          </CardTitle>
          <CardDescription>
            <SeverityBadge
              severity={
                finding.data?.vulnerability.severity ??
                VulnerabilitySeverity.Info
              }
            />
          </CardDescription>
          <CardAction>
            <Link
              to="/vulnerabilities/$id"
              params={{ id: finding.data?.vulnerability.id ?? "" }}
              disabled={finding.isLoading}
            >
              <ExternalLink className="text-accent-foreground" size={20} />
            </Link>
          </CardAction>
        </CardHeader>
        <CardContent>
          <CardContent>
            <Markdown>{finding.data?.vulnerability.description ?? ""}</Markdown>
          </CardContent>
        </CardContent>
      </Card>
    )
  }

  function EvidenceCard() {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Evidence</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea>
            <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
              {finding.data?.evidence}
            </Markdown>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </CardContent>
      </Card>
    )
  }

  return finding.isPending ? (
    <CardPlaceholder />
  ) : (
    <div className="flex flex-row gap-3 w-full h-screen">
      <div className="flex flex-col w-full gap-3">
        <AssetInfoItem assetId={displayData?.assetId ?? ""} />
        <VulnerabilityCard />
        <EvidenceCard />
      </div>
      <FindingSidebar />
    </div>
  )
}
