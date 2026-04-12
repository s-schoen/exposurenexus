import { createFileRoute } from "@tanstack/react-router"
import { usePageMeta } from "@/context/page.tsx"
import { AssetTable } from "@/components/asset-table"

export const Route = createFileRoute("/_authenticated/assets/")({
  component: RouteComponent
})

function RouteComponent() {
  usePageMeta({
    title: "Assets",
    description: "View systems in scope."
  })

  return (
    <div>
      <AssetTable />
    </div>
  )
}
