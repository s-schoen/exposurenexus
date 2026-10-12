import { useSuspenseQuery } from "@tanstack/react-query";
import { Plus, Users } from "lucide-react";
import { lazy, useMemo } from "react";

import { DetailPeek } from "@/components/detail-peek.tsx";
import { UserList } from "@/features/users/components/user-list/index.tsx";
import { useCreateUser } from "@/features/users/hooks/use-create-user.ts";
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
  const createUser = useCreateUser();
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
          void createUser();
        },
      },
    ],
    [createUser],
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
          void createUser();
        }}
      />
      <DetailPeek
        selectedId={selectedSearch.selectedId}
        label="User details"
        getFullPageHref={(id) => `/settings/users/${id}`}
        onClose={() => {
          void selectedSearch.clearSelected();
        }}
      >
        {(id) => <UserPreview userId={id} />}
      </DetailPeek>
    </>
  );
}
