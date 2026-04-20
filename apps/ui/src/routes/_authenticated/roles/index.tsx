import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { parseAsArrayOf, parseAsString, useQueryState } from "nuqs"
import type { DataTableFilterState } from "@/components/data-table/types.ts"
import { createListRolesQueryOptions } from "@/api/role.ts"
import { DetailPreviewDialog } from "@/components/detail-preview-dialog.tsx"
import { RoleDetailContent } from "@/components/role-detail-content.tsx"
import { RoleTable } from "@/components/role-table"
import { usePageMeta } from "@/context/page.tsx"

export const Route = createFileRoute("/_authenticated/roles/")({
  validateSearch: (search) => ({
    ...search,
    selected: typeof search.selected === "string" ? search.selected : undefined
  }),
  component: RouteComponent
})

function RouteComponent() {
  const navigate = useNavigate()
  const { selected } = Route.useSearch()
  const rolesQuery = useQuery(createListRolesQueryOptions())
  const [filter, setFilter] = useQueryState("filter")
  const [kindFilter, setKindFilter] = useQueryState(
    "kind",
    parseAsArrayOf(parseAsString).withDefault([])
  )

  const filterState = useMemo<DataTableFilterState>(
    () => ({
      globalFilter: filter ?? "",
      selectFilters: kindFilter.length > 0 ? { kind: kindFilter } : {}
    }),
    [filter, kindFilter]
  )

  usePageMeta({
    title: "Roles",
    description: "Browse roles and permissions."
  })

  const handleFilterStateChange = (nextState: DataTableFilterState) => {
    void setFilter(nextState.globalFilter ? nextState.globalFilter : null)
    const nextKindFilter = nextState.selectFilters.kind ?? []

    void setKindFilter(nextKindFilter.length ? nextKindFilter : null)
  }

  return (
    <>
      <RoleTable
        query={rolesQuery}
        selectedRoleId={selected}
        filterState={filterState}
        onFilterStateChange={handleFilterStateChange}
        onSelectRole={(role) =>
          navigate({
            to: "/roles",
            replace: true,
            search: (prev) => ({
              ...prev,
              selected: role.id
            })
          })
        }
        onOpenRole={(role) =>
          navigate({
            to: "/roles/$id",
            params: {
              id: role.id
            }
          })
        }
      />
      <DetailPreviewDialog
        selectedId={selected}
        onClose={() =>
          navigate({
            to: "/roles",
            replace: true,
            search: (prev) => ({
              ...prev,
              selected: undefined
            })
          })
        }
        title="Role details"
        description="Review the selected role without leaving the roles table."
        fullPageHref={selected ? `/roles/${selected}` : undefined}
      >
        {selected && <RoleDetailContent roleId={selected} />}
      </DetailPreviewDialog>
    </>
  )
}
