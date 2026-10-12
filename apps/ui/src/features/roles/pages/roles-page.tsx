import { useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { KeyRound, Plus } from "lucide-react";
import { lazy, useMemo } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog.tsx";
import { DetailPeek } from "@/components/detail-peek.tsx";
import { RoleList } from "@/features/roles/components/role-list/index.tsx";
import { useCreateRole } from "@/features/roles/hooks/use-create-role.ts";
import { useRoleLifecycle } from "@/features/roles/hooks/use-role-lifecycle.ts";
import { useRoleTableSearchState } from "@/features/roles/hooks/use-role-table-search-state.ts";
import { isBuiltInRoleId } from "@/features/roles/lib/role.ts";
import { createListRolesQueryOptions } from "@/features/roles/queries/roles.ts";
import { usePageMeta } from "@/hooks/use-page-meta.tsx";
import { useSelectedSearchParam } from "@/hooks/use-selected-search-param.ts";

import type { Role } from "@exposurenexus/contracts/model/rbac";

const RolePreview = lazy(() =>
  import("@/features/roles/components/role-preview.tsx").then((module) => ({
    default: module.RolePreview,
  })),
);

interface RolesPageProps {
  search?: Record<string, unknown>;
  selected?: string;
}

export function RolesPage({ search = {}, selected }: RolesPageProps) {
  const navigate = useNavigate();
  const createRole = useCreateRole();
  const roleLifecycle = useRoleLifecycle();
  const { filterState, onFilterStateChange } = useRoleTableSearchState({
    search,
  });
  const selectedSearch = useSelectedSearchParam<Role>({
    selectedId: selected,
    to: "/settings/roles",
    replace: true,
    getId: (role) => role.id,
  });
  const rolesQuery = useSuspenseQuery(createListRolesQueryOptions());

  const actions = useMemo(
    () => [
      {
        label: "New role",
        icon: Plus,
        onClick: () => {
          void createRole();
        },
      },
    ],
    [createRole],
  );

  usePageMeta({
    title: "Roles",
    icon: KeyRound,
    count: rolesQuery.data.length,
    actions,
  });

  const handleOpenRole = async (role: Role) => {
    await navigate({
      to: "/settings/roles/$id",
      params: {
        id: role.id,
      },
    });
  };

  const handleDeleteRoles = async (roles: Array<Role>) => {
    const customRoles = roles.filter((role) => !isBuiltInRoleId(role.id));

    if (customRoles.length === 0) {
      toast.error("Built-in roles cannot be deleted");
      return;
    }

    const confirmed = await ConfirmDialog.call({
      title: "Delete roles",
      description: "This action cannot be undone",
      message: `Are you sure you want to delete ${customRoles.length} custom role(s)?`,
      confirmVariant: "destructive",
    });

    if (!confirmed) {
      return;
    }

    const result = await roleLifecycle.deleteRoles(customRoles);
    const deletedRoleIds = new Set(result.successful.map((role) => role.id));

    if (selected && deletedRoleIds.has(selected)) {
      await selectedSearch.clearSelected();
    }
  };

  return (
    <>
      <RoleList
        query={rolesQuery}
        selectedRoleId={selectedSearch.selectedId}
        filterState={filterState}
        onFilterStateChange={onFilterStateChange}
        onSelectRole={(role) => {
          void selectedSearch.selectRow(role);
        }}
        onOpenRole={(role) => {
          void handleOpenRole(role);
        }}
        onCreateRole={() => {
          void createRole();
        }}
        onDeleteRoles={handleDeleteRoles}
      />
      <DetailPeek
        selectedId={selectedSearch.selectedId}
        label="Role details"
        getFullPageHref={(id) => `/settings/roles/${id}`}
        onClose={() => {
          void selectedSearch.clearSelected();
        }}
      >
        {(id) => <RolePreview roleId={id} />}
      </DetailPeek>
    </>
  );
}
