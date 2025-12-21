import { createFileRoute } from "@tanstack/react-router"
import { usePage } from "@/context/page.tsx"
import { AssetTable } from "@/components/asset-table"

export const Route = createFileRoute("/_authenticated/assets/")({
  component: RouteComponent
})

function RouteComponent() {
  const page = usePage()
  page.setTitle("Assets")

  return (
    <div>
      <AssetTable />
    </div>
  )
}
