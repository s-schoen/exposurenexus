import { createFileRoute } from "@tanstack/react-router"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from "@/components/ui/card.tsx"
import { Skeleton } from "@/components/ui/skeleton.tsx"
import { usePage } from "@/context/page.tsx"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table.tsx"
import { capitalizeFirstLetter } from "@/lib/utils.ts"
import { useQuery } from "@tanstack/react-query"
import { createAssetByIDQueryOptions } from "@/api/asset.ts"

export const Route = createFileRoute("/_authenticated/assets/$id")({
  component: RouteComponent
})

function RouteComponent() {
  const { id } = Route.useParams()
  const asset = useQuery(createAssetByIDQueryOptions(id))

  const page = usePage()
  page.setTitle("Asset details")

  function CardPlaceholder() {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    )
  }

  function AssetDetails() {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="font-semibold">
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>{asset.data?.name}</TableCell>
                <TableCell>
                  {capitalizeFirstLetter(asset.data?.type!)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    )
  }

  return <div>{asset.isPending ? <CardPlaceholder /> : <AssetDetails />}</div>
}
