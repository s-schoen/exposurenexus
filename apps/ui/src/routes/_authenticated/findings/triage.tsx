import { useEffect } from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { parseAsArrayOf, parseAsString, useQueryState } from "nuqs"
import { FindingStatus } from "@openvlp/types/model/finding"
import { DetailPreviewDialog } from "@/components/detail-preview-dialog.tsx"
import { FindingTable } from "@/components/finding-table"
import { FindingDetailContent } from "@/components/finding-detail-content.tsx"
import { usePageMeta } from "@/context/page.tsx"

export const Route = createFileRoute("/_authenticated/findings/triage")({
  validateSearch: (search) => ({
    ...search,
    selected: typeof search.selected === "string" ? search.selected : undefined,
    status: Array.isArray(search.status)
      ? search.status.filter(
          (value): value is string => typeof value === "string"
        )
      : typeof search.status === "string"
        ? [search.status]
        : undefined
  }),
  component: RouteComponent
})

function RouteComponent() {
  const navigate = useNavigate()
  const [status, setStatus] = useQueryState(
    "status",
    parseAsArrayOf(parseAsString).withDefault([])
  )
  const { selected } = Route.useSearch()

  useEffect(() => {
    if (status.length === 0) {
      setStatus([FindingStatus.Active])
    }
  }, [setStatus, status])

  usePageMeta({
    title: "Triage Queue",
    description:
      "Work through active findings in a queue optimized for repetitive triage."
  })

  return (
    <>
      <div className="flex flex-col gap-4">
        <FindingTable
          initialGrouping={["assetId"]}
          selectedFindingId={selected}
          onSelectFinding={(finding) =>
            navigate({
              to: "/findings/triage",
              replace: true,
              search: (prev) => ({
                ...prev,
                status: prev.status,
                selected: finding.id
              })
            })
          }
        />
      </div>
      <DetailPreviewDialog
        selectedId={selected}
        onClose={() =>
          navigate({
            to: "/findings/triage",
            replace: true,
            search: (prev) => ({
              ...prev,
              status: prev.status,
              selected: undefined
            })
          })
        }
        title="Finding details"
        description="Review and update the selected finding without leaving the triage queue."
        fullPageHref={selected ? `/findings/${selected}` : undefined}
      >
        {selected && <FindingDetailContent findingId={selected} />}
      </DetailPreviewDialog>
    </>
  )
}
