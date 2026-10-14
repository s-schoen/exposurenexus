import { useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { KeyRound, Plus } from "lucide-react";
import { lazy, useMemo } from "react";

import { DetailPeek } from "@/components/detail-peek.tsx";
import { RoleList } from "@/features/roles/components/role-list/index.tsx";
import { useCreateRole } from "@/features/roles/hooks/use-create-role.ts";
import { useDeleteRoles } from "@/features/roles/hooks/use-role-record-actions.ts";
import { useRoleTableSearchState } from "@/features/roles/hooks/use-role-table-search-state.ts";
import { createListRolesQueryOptions } from "@/features/roles/queries/roles.ts";
import { usePageMeta } from "@/hooks/use-page-meta.tsx";
import { useSelectedSearchParam } from "@/hooks/use-selected-search-param.ts";

import type { Role } from "@exposurenexus/contracts/model/rbac";

const RolePreview = lazy(() =>
  import("@/features/roles/components/role-preview.tsx").then((module) => ({
    default: module.RolePreview,
  })),
);
const RolePeekMenu = lazy(() =>
  import("@/features/roles/components/role-preview.tsx").then((module) => ({
    default: module.RolePeekMenu,
  })),
);

interface RolesPageProps {
  search?: Record<string, unknown>;
  selected?: string;
}

export function RolesPage({ search = {}, selected }: RolesPageProps) {
  const navigate = useNavigate();
  const createRole = useCreateRole();
  const deleteRoles = useDeleteRoles();
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
        onDeleteRoles={deleteRoles}
      />
      <DetailPeek
        selectedId={selectedSearch.selectedId}
        label="Role details"
        getFullPageHref={(id) => `/settings/roles/${id}`}
        menu={(id) => <RolePeekMenu roleId={id} />}
        onClose={() => {
          void selectedSearch.clearSelected();
        }}
      >
        {(id) => <RolePreview roleId={id} />}
      </DetailPeek>
    </>
  );
}
