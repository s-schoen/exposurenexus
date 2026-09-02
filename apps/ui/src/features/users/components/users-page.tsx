import { useNavigate } from "@tanstack/react-router";

import { DetailPreviewDialog } from "@/components/detail-preview-dialog.tsx";
import { UserDetailContent } from "@/components/user-detail-content.tsx";
import { UserTable } from "@/components/user-table";
import { usePageMeta } from "@/hooks/use-page-meta.tsx";
import { useSelectedSearchParam } from "@/hooks/use-selected-search-param.ts";
import { useUserTableSearchState } from "@/hooks/use-user-table-search-state.ts";

import type { UserProfile } from "@exposurenexus/contracts/model/user";

interface UsersPageProps {
  search?: Record<string, unknown>;
  selected?: string;
}

export function UsersPage({ search = {}, selected }: UsersPageProps) {
  const navigate = useNavigate();
  const { filterState, onFilterStateChange } = useUserTableSearchState({
    search,
  });
  const selectedSearch = useSelectedSearchParam<UserProfile>({
    selectedId: selected,
    to: "/users",
    getId: (user) => user.id,
  });

  usePageMeta({
    title: "Users",
    description: "Browse users with access to the platform.",
  });

  return (
    <>
      <UserTable
        filterState={filterState}
        onFilterStateChange={onFilterStateChange}
        selectedUserId={selectedSearch.selectedId}
        onSelectUser={(user) => {
          void selectedSearch.selectRow(user);
        }}
        onCreateUser={() => {
          void navigate({ to: "/users/new" });
        }}
      />
      <DetailPreviewDialog
        selectedId={selectedSearch.selectedId}
        onClose={() => {
          void selectedSearch.clearSelected();
        }}
        title="User details"
        description="Review the selected user without leaving the user table."
        fullPageHref={selected ? `/users/${selected}` : undefined}
      >
        {selected && <UserDetailContent userId={selected} />}
      </DetailPreviewDialog>
    </>
  );
}
