import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Pencil } from "lucide-react";
import { useMemo } from "react";

import { buttonVariants } from "@/components/ui/button.tsx";
import { createListRolesQueryOptions } from "@/features/roles";
import { UserDetailContent } from "@/features/users/components/user-detail-content.tsx";
import { createUserByIDQueryOptions } from "@/features/users/queries/users.ts";
import { usePageMeta } from "@/hooks/use-page-meta.tsx";
import { cn } from "@/lib/utils.ts";

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
            to: "/users/$id/edit",
            params: { id: userId },
          });
        },
      },
    ],
    [navigate, userId],
  );

  usePageMeta({
    title: user.data.displayName,
    description: "Review account identity fields, status, and role assignments.",
    actions,
  });

  return (
    <UserDetailContent
      user={user.data}
      roles={roles.data}
      titleAction={
        <Link
          to="/users"
          search={(previous) => ({
            enabled: previous.enabled,
            filter: previous.filter,
            selected: undefined,
          })}
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2 rounded-xl")}
        >
          <ArrowLeft />
          Back to users
        </Link>
      }
    />
  );
}
