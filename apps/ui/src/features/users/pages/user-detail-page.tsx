import { useSuspenseQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";

import { createListRolesQueryOptions } from "@/features/roles";
import { UserDetailContent } from "@/features/users/components/user-detail-content.tsx";
import { useUserRecordActions } from "@/features/users/hooks/use-user-record-actions.ts";
import { createUserByIDQueryOptions } from "@/features/users/queries/users.ts";
import { usePageMeta } from "@/hooks/use-page-meta.tsx";

interface UserDetailPageProps {
  userId: string;
}

export function UserDetailPage({ userId }: UserDetailPageProps) {
  const user = useSuspenseQuery(createUserByIDQueryOptions(userId));
  const roles = useSuspenseQuery(createListRolesQueryOptions());
  const actions = useUserRecordActions(user.data);

  usePageMeta({
    title: user.data.displayName,
    icon: Users,
    breadcrumbs: [{ label: "Users", to: "/settings/users" }],
    menu: actions,
  });

  return <UserDetailContent user={user.data} roles={roles.data} />;
}
