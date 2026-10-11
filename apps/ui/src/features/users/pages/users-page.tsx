import { useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Plus, Users } from "lucide-react";
import { lazy, Suspense, useMemo } from "react";

import { DetailPreviewDialog } from "@/components/detail-preview-dialog.tsx";
import { UserList } from "@/features/users/components/user-list/index.tsx";
import { useUserTableSearchState } from "@/features/users/hooks/use-user-table-search-state.ts";
import { createListUsersQueryOptions } from "@/features/users/queries/users.ts";
import { usePageMeta } from "@/hooks/use-page-meta.tsx";
import { useSelectedSearchParam } from "@/hooks/use-selected-search-param.ts";

import type { UserProfile } from "@exposurenexus/contracts/model/user";

const UserPreview = lazy(() =>
  import("@/features/users/components/user-preview.tsx").then((module) => ({
    default: module.UserPreview,
  })),
);

interface UsersPageProps {
  search?: Record<string, unknown>;
  selected?: string;
}

export function UsersPage({ search = {}, selected }: UsersPageProps) {
  const navigate = useNavigate();
  const { filterState, onFilterStateChange } = useUserTableSearchState({
    search,
  });
  const users = useSuspenseQuery(createListUsersQueryOptions());
  const selectedSearch = useSelectedSearchParam<UserProfile>({
    selectedId: selected,
    to: "/settings/users",
    getId: (user) => user.id,
  });

  const actions = useMemo(
    () => [
      {
        label: "New user",
        icon: Plus,
        onClick: () => {
          void navigate({ to: "/settings/users/new" });
        },
      },
    ],
    [navigate],
  );

  usePageMeta({
    title: "Users",
    icon: Users,
    count: users.data.length,
    actions,
  });

  return (
    <>
      <UserList
        filterState={filterState}
        onFilterStateChange={onFilterStateChange}
        selectedUserId={selectedSearch.selectedId}
        onSelectUser={(user) => {
          void selectedSearch.selectRow(user);
        }}
        onCreateUser={() => {
          void navigate({ to: "/settings/users/new" });
        }}
      />
      <DetailPreviewDialog
        selectedId={selectedSearch.selectedId}
        onClose={() => {
          void selectedSearch.clearSelected();
        }}
        title="User details"
        description="Review the selected user without leaving the user list."
        fullPageHref={selected ? `/settings/users/${selected}` : undefined}
      >
        {selected && (
          <Suspense fallback={null}>
            <UserPreview userId={selected} />
          </Suspense>
        )}
      </DetailPreviewDialog>
    </>
  );
}
