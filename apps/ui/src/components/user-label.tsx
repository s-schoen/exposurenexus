import { useQuery } from "@tanstack/react-query";

import { createListUsersQueryOptions } from "@/api/user.ts";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { cn } from "@/lib/utils";

import type { UserProfile } from "@exposurenexus/contracts/model/user";

export const USER_LABEL_EMPTY_LABEL = "No User";
export const USER_LABEL_UNKNOWN_LABEL = "Unknown User";

export type UserLabelVariant = "chip" | "text";

interface UserLabelProps {
  user?: UserProfile | null;
  userId?: string | null;
  emptyLabel?: string;
  unknownLabel?: string;
  variant?: UserLabelVariant;
  className?: string;
}

export function createUserProfileById(
  users: Array<UserProfile> | undefined,
): Map<string, UserProfile> {
  return new Map((users ?? []).map((user) => [user.id, user]));
}

export function getUserProfileDisplayName(user: UserProfile): string {
  return user.displayName || user.username || user.email;
}

export function formatUserProfileReference(
  userId: string | null | undefined,
  userProfileById: Map<string, UserProfile>,
  {
    emptyLabel = USER_LABEL_EMPTY_LABEL,
    unknownLabel = USER_LABEL_UNKNOWN_LABEL,
  }: {
    emptyLabel?: string;
    unknownLabel?: string;
  } = {},
): string {
  if (!userId) {
    return emptyLabel;
  }

  const user = userProfileById.get(userId);

  return user ? getUserProfileDisplayName(user) : unknownLabel;
}

export function UserLabel({
  user,
  userId,
  emptyLabel = USER_LABEL_EMPTY_LABEL,
  unknownLabel = USER_LABEL_UNKNOWN_LABEL,
  variant = "text",
  className,
}: UserLabelProps) {
  const shouldResolveUser = typeof user === "undefined" && Boolean(userId);
  const resolvedUser = useQuery({
    ...createListUsersQueryOptions(),
    enabled: shouldResolveUser,
    select: (users) => users.find((candidate) => candidate.id === userId) ?? null,
  });
  const effectiveUser = typeof user === "undefined" ? resolvedUser.data : user;

  function renderLabel(children: string, fallback = false) {
    if (variant === "chip") {
      return (
        <Badge
          variant="outline"
          className={cn(
            "max-w-full rounded-md font-normal",
            fallback && "border-dashed text-muted-foreground",
            className,
          )}
        >
          <span className="truncate">{children}</span>
        </Badge>
      );
    }

    return <span className={cn(fallback && "text-muted-foreground", className)}>{children}</span>;
  }

  if (!userId && !effectiveUser) {
    return renderLabel(emptyLabel, true);
  }

  if (shouldResolveUser && resolvedUser.isPending) {
    return <Skeleton className={cn("inline-flex h-4 w-24", className)} />;
  }

  if (!effectiveUser) {
    return renderLabel(unknownLabel, true);
  }

  return renderLabel(getUserProfileDisplayName(effectiveUser));
}
