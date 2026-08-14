import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Pencil } from "lucide-react";
import { useMemo } from "react";

import { createUserByIDQueryOptions } from "@/api/user.ts";
import { buttonVariants } from "@/components/ui/button.tsx";
import { UserDetailContent } from "@/components/user-detail-content.tsx";
import { usePageMeta } from "@/context/page.tsx";
import { cn } from "@/lib/utils.ts";

interface UserDetailPageProps {
  userId: string;
}

export function UserDetailPage({ userId }: UserDetailPageProps) {
  const navigate = useNavigate();
  const user = useQuery(createUserByIDQueryOptions(userId));
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
    title: user.data?.displayName ?? "User",
    description: "Review account identity fields, status, and role assignments.",
    actions,
  });

  return (
    <UserDetailContent
      userId={userId}
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
