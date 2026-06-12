import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"
import type { Role } from "@exposurenexus/types/model/rbac"
import { createListRolesQueryOptions } from "@/api/role.ts"
import { ConfirmDialog } from "@/components/confirm-dialog.tsx"
import { DetailPreviewDialog } from "@/components/detail-preview-dialog.tsx"
import { RoleDetailContent } from "@/components/role-detail-content.tsx"
import { RoleTable } from "@/components/role-table"
import { usePageMeta } from "@/context/page.tsx"
import { useRoleLifecycle } from "@/hooks/use-role-lifecycle.ts"
import { isBuiltInRoleId } from "@/lib/role.ts"
import { useSelectedSearchParam } from "@/hooks/use-selected-search-param.ts"
import { useRoleTableSearchState } from "@/hooks/use-role-table-search-state.ts"

interface RolesPageProps {
  search?: Record<string, unknown>
  selected?: string
}

export function RolesPage({
  search = {},
  selected
}: RolesPageProps) {
  const navigate = useNavigate()
  const roleLifecycle = useRoleLifecycle()
  const { filterState, onFilterStateChange } = useRoleTableSearchState({
    search
  })
  const selectedSearch = useSelectedSearchParam<Role>({
    selectedId: selected,
    to: "/roles",
    replace: true,
    getId: (role) => role.id
  })
  const rolesQuery = useQuery(createListRolesQueryOptions())

  usePageMeta({
    title: "Roles",
    description: "Browse roles and permissions."
  })

  const handleOpenRole = async (role: Role) => {
    await navigate({
      to: "/roles/$id",
      params: {
        id: role.id
      }
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
      await selectedSearch.clearSelected()
    }
  }

  return (
    <>
      <RoleTable
        query={rolesQuery}
        selectedRoleId={selectedSearch.selectedId}
        filterState={filterState}
        onFilterStateChange={onFilterStateChange}
        onSelectRole={(role) => {
          void selectedSearch.selectRow(role)
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
        selectedId={selectedSearch.selectedId}
        onClose={() => {
          void selectedSearch.clearSelected()
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
