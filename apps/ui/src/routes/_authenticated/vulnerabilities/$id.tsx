import { createFileRoute } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import Markdown from "react-markdown"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from "@/components/ui/card.tsx"
import { Skeleton } from "@/components/ui/skeleton.tsx"
import { ScrollArea } from "@/components/ui/scroll-area.tsx"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table.tsx"
import { SeverityBadge } from "@/components/severity-badge.tsx"
import { usePage } from "@/context/page.tsx"
import { createVulnerabilityByIDQueryOptions } from "@/api/vulnerability.ts"

export const Route = createFileRoute("/_authenticated/vulnerabilities/$id")({
  component: RouteComponent
})

function RouteComponent() {
  const { id } = Route.useParams()
  const vulnerability = useQuery(createVulnerabilityByIDQueryOptions(id))

  const page = usePage()
  page.setTitle("Vulnerability")

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

  function VulnerabilityCards() {
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
                    <TableCell>{vulnerability.data?.title}</TableCell>
                  </TableRow>

                  <TableRow>
                    <TableCell className="font-bold">Severity</TableCell>
                    <TableCell>
                      <SeverityBadge severity={vulnerability.data!.severity} />
                    </TableCell>
                  </TableRow>

                  <TableRow>
                    <TableCell className="font-bold">CVE</TableCell>
                    <TableCell>{vulnerability.data!.cve}</TableCell>
                  </TableRow>

                  <TableRow>
                    <TableCell className="font-bold">CWE</TableCell>
                    <TableCell>{vulnerability.data!.cwe}</TableCell>
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
              <Markdown>{vulnerability.data?.description}</Markdown>
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    )
  }

  return vulnerability.isPending ? <CardPlaceholder /> : <VulnerabilityCards />
}
