import { createFileRoute } from "@tanstack/react-router"
import { usePage } from "@/context/page.tsx"
import { useQuery } from "@tanstack/react-query"
import { listAssets } from "@/api/asset.ts"

export const Route = createFileRoute("/_authenticated/assets/")({
  component: RouteComponent
})

function RouteComponent() {
  const page = usePage()
  page.setTitle("Assets")

  const assetQuery = useQuery({
    queryKey: ["assets"],
    queryFn: listAssets,
    initialData: []
  })

  return (
    <div>
      {assetQuery.data?.map((i) => (
        <span>{i.name}</span>
      ))}
    </div>
  )
}
