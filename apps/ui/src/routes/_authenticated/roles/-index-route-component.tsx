import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { parseAsArrayOf, parseAsString, useQueryState } from "nuqs"
import { toast } from "sonner"
import type { Role } from "@exposurenexus/types/model/rbac"
import type { DataTableFilterState } from "@/components/data-table/types.ts"
import { createListRolesQueryOptions } from "@/api/role.ts"
import { ConfirmDialog } from "@/components/confirm-dialog.tsx"
import { DetailPreviewDialog } from "@/components/detail-preview-dialog.tsx"
import { RoleDetailContent } from "@/components/role-detail-content.tsx"
import { RoleTable } from "@/components/role-table"
import { usePageMeta } from "@/context/page.tsx"
import { useRoleLifecycle } from "@/hooks/use-role-lifecycle.ts"
import { isBuiltInRoleId } from "@/lib/role.ts"

interface RoleIndexRouteComponentProps {
  selected?: string
}

export function RoleIndexRouteComponent({
  selected
}: RoleIndexRouteComponentProps) {
  const navigate = useNavigate()
  const roleLifecycle = useRoleLifecycle()
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

  const handleSelectRole = async (role: Role) => {
    await navigate({
      to: "/roles",
      replace: true,
      search: (prev) => ({
        ...prev,
        selected: role.id
      })
    })
  }

  const handleOpenRole = async (role: Role) => {
    await navigate({
      to: "/roles/$id",
      params: {
        id: role.id
      }
    })
  }

  const handleClearSelectedRole = async () => {
    await navigate({
      to: "/roles",
      replace: true,
      search: (prev) => ({
        ...prev,
        selected: undefined
      })
    })
  }

  const handleDeleteRoles = async (roles: Array<Role>) => {
    const customRoles = roles.filter((role) => !isBuiltInRoleId(role.id))

    if (customRoles.length === 0) {
      toast.error("Built-in roles cannot be deleted")
      return
    }

    const confirmed = await ConfirmDialog.call({
      title: "Delete Roles",
      description: "This action cannot be undone",
      message: `Are you sure you want to delete ${customRoles.length} custom role(s)?`,
      confirmVariant: "destructive"
    })

    if (!confirmed) {
      return
    }

    const result = await roleLifecycle.deleteRoles(customRoles)
    const deletedRoleIds = new Set(
      result.successful.map((role) => role.id)
    )

    if (selected && deletedRoleIds.has(selected)) {
      await handleClearSelectedRole()
    }
  }

  return (
    <>
      <RoleTable
        query={rolesQuery}
        selectedRoleId={selected}
        filterState={filterState}
        onFilterStateChange={handleFilterStateChange}
        onSelectRole={(role) => {
          void handleSelectRole(role)
        }}
        onOpenRole={(role) => {
          void handleOpenRole(role)
        }}
        onCreateRole={() => {
          void navigate({ to: "/roles/new" })
        }}
        onDeleteRoles={handleDeleteRoles}
      />
      <DetailPreviewDialog
        selectedId={selected}
        onClose={() => {
          void handleClearSelectedRole()
        }}
        title="Role details"
        description="Review the selected role without leaving the roles table."
        fullPageHref={selected ? `/roles/${selected}` : undefined}
      >
        {selected && <RoleDetailContent roleId={selected} />}
      </DetailPreviewDialog>
    </>
  )
}
