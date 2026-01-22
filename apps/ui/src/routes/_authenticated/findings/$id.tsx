import { createFileRoute } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
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
import { formatFindingStatus, formatSeverity } from "@/lib/format.ts"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area.tsx"
import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypeRaw from "rehype-raw"
import { SeverityBadge } from "@/components/severity-badge.tsx"
import { VulnerabilitySeverity } from "@openvlp/types/model/vulnerability"

export const Route = createFileRoute("/_authenticated/findings/$id")({
  component: RouteComponent
})

function RouteComponent() {
  const { id } = Route.useParams()
  const finding = useQuery(createFindingByIDQueryOptions(id))

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
            <CardHeader>
              <CardTitle>Details</CardTitle>
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
                    <TableCell>{finding.data?.vulnerability.title}</TableCell>
                  </TableRow>

                  <TableRow>
                    <TableCell className="font-bold">Severity</TableCell>
                    <TableCell>
                      <SeverityBadge severity={finding.data!.severity} />
                    </TableCell>
                  </TableRow>

                  <TableRow>
                    <TableCell className="font-bold">Status</TableCell>
                    <TableCell>
                      {formatFindingStatus(finding.data!.status)}
                    </TableCell>
                  </TableRow>

                  <TableRow>
                    <TableCell className="font-bold">Source</TableCell>
                    <TableCell>{finding.data!.source}</TableCell>
                  </TableRow>

                  <TableRow>
                    <TableCell className="font-bold">Asset</TableCell>
                    <TableCell>{finding.data!.assetId}</TableCell>
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
              <Markdown>{finding.data?.description}</Markdown>
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
