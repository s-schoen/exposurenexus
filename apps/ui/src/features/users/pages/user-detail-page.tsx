import { useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Pencil, Users } from "lucide-react";
import { useMemo } from "react";

import { createListRolesQueryOptions } from "@/features/roles";
import { UserDetailContent } from "@/features/users/components/user-detail-content.tsx";
import { createUserByIDQueryOptions } from "@/features/users/queries/users.ts";
import { usePageMeta } from "@/hooks/use-page-meta.tsx";

interface UserDetailPageProps {
  userId: string;
}

export function UserDetailPage({ userId }: UserDetailPageProps) {
  const navigate = useNavigate();
  const user = useSuspenseQuery(createUserByIDQueryOptions(userId));
  const roles = useSuspenseQuery(createListRolesQueryOptions());
  const actions = useMemo(
    () => [
      {
        label: "Edit user",
        icon: Pencil,
        onClick: () => {
          void navigate({
            to: "/settings/users/$id/edit",
            params: { id: userId },
          });
        },
      },
    ],
    [navigate, userId],
  );

  usePageMeta({
    title: user.data.displayName,
    icon: Users,
    breadcrumbs: [{ label: "Users", to: "/settings/users" }],
    actions,
  });

  return <UserDetailContent user={user.data} roles={roles.data} />;
}
