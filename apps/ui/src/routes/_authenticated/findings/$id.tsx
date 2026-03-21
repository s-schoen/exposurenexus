import { createFileRoute } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypeRaw from "rehype-raw"
import { useState } from "react"
import { createFindingByIDQueryOptions } from "@/api/finding.ts"
import { usePage } from "@/context/page.tsx"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from "@/components/ui/card.tsx"
import { Skeleton } from "@/components/ui/skeleton.tsx"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table.tsx"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area.tsx"
import { SeverityBadge } from "@/components/severity-badge.tsx"
import { Inplace } from "@/components/inplace.tsx"
import { formatFindingStatus, formatSeverity } from "@/lib/format.ts"
import { type Finding, FindingStatus } from "@openvlp/types/model/finding"
import { VulnerabilitySeverity } from "@openvlp/types/model/vulnerability"
import { Button } from "@/components/ui/button.tsx"
import { LucideCheck, XIcon } from "lucide-react"

export const Route = createFileRoute("/_authenticated/findings/$id")({
  component: RouteComponent
})

function RouteComponent() {
  const { id } = Route.useParams()
  const finding = useQuery(createFindingByIDQueryOptions(id))
  // local draft, null means no pending changes
  const [draft, setDraft] = useState<Finding | null>(null)
  const displayData = draft ?? finding.data

  const hasPendingChanges = draft !== null

  function updateDraft<K extends keyof Finding>(key: K, value: Finding[K]) {
    setDraft((prev) => ({ ...(prev ?? finding.data!), [key]: value }))
  }

  async function handleSave() {
    if (!draft) return
    // TODO: call PUT /api/findings/${id} with `draft` once the API client
    //       function is implemented in src/api/finding.ts, then replace the
    //       lines below with:
    //         await updateFinding(id, draft)
    //         await useQueryClient().invalidateQueries({ queryKey: ["findings", id] })
    console.log("Saving finding:", draft)
    setDraft(null)
  }

  function handleDiscard() {
    setDraft(null)
  }

  const page = usePage()
  page.setTitle("Finding")

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

  function FindingCards() {
    return (
      <ScrollArea className="w-full gap-3 h-screen">
        <div className="flex flex-col w-full gap-3">
          <Card className="w-full">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Details</CardTitle>
              {hasPendingChanges && (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={handleDiscard}>
                    <div className="flex items-center gap-1">
                      <XIcon />
                      Discard
                    </div>
                  </Button>
                  <Button size="sm" onClick={handleSave}>
                    <div className="flex items-center gap-1">
                      <LucideCheck />
                      Save
                    </div>
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="font-semibold">
                    <TableHead className="font-bold">Property</TableHead>
                    <TableHead>Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-bold">Title</TableCell>
                    <TableCell>{displayData?.vulnerability.title}</TableCell>
                  </TableRow>

                  <TableRow>
                    <TableCell className="font-bold">Severity</TableCell>
                    <TableCell>
                      <Inplace
                        value={displayData!.severity}
                        displayElement={(severityValue) => (
                          <SeverityBadge severity={severityValue} />
                        )}
                        editElement={{
                          type: "select",
                          options: Object.values(VulnerabilitySeverity).map(
                            (v) => ({
                              label: formatSeverity(v),
                              value: v
                            })
                          )
                        }}
                        onSave={(value) => updateDraft("severity", value)}
                      />
                    </TableCell>
                  </TableRow>

                  <TableRow>
                    <TableCell className="font-bold">Status</TableCell>
                    <TableCell>
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
                        onSave={(value) => updateDraft("status", value)}
                      />
                    </TableCell>
                  </TableRow>

                  <TableRow>
                    <TableCell className="font-bold">Source</TableCell>
                    <TableCell>
                      <Inplace
                        value={displayData!.source}
                        editElement={{ type: "input" }}
                        onSave={(value) => updateDraft("source", value)}
                      />
                    </TableCell>
                  </TableRow>

                  <TableRow>
                    <TableCell className="font-bold">Asset</TableCell>
                    <TableCell>{displayData!.assetId}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="w-full">
            <CardHeader>
              <CardTitle>Description</CardTitle>
            </CardHeader>
            <CardContent>
              <Markdown>
                {finding.data?.vulnerability.description ?? ""}
              </Markdown>
            </CardContent>
          </Card>

          <Card className="w-full">
            <CardHeader>
              <CardTitle>Evidence</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea>
                <Markdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeRaw]}
                >
                  {finding.data?.evidence}
                </Markdown>
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    )
  }

  return finding.isPending ? <CardPlaceholder /> : <FindingCards />
}
