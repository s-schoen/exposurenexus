import { UserRound } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  USER_LABEL_EMPTY_LABEL,
  USER_LABEL_UNKNOWN_LABEL,
  getUserProfileDisplayName,
} from "@/features/users/components/user-label.tsx";

import type { UserProfile } from "@exposurenexus/contracts/model/user";

export function getUserInitials(name: string): string {
  const words = name
    .trim()
    .split(/[\s._@-]+/)
    .filter(Boolean);
  const initials = words.length > 1 ? words[0][0] + words[1][0] : (words[0]?.slice(0, 2) ?? "");

  return initials.toUpperCase() || "?";
}

interface UserAvatarProps {
  userId: string | null;
  /** The resolved profile, `null` when it is unknown, or `undefined` while users load. */
  user: UserProfile | null | undefined;
  emptyLabel?: string;
  unknownLabel?: string;
}

// A 20px initials avatar for list rows, named for assistive technology and hover by the user's name.
export function UserAvatar({
  userId,
  user,
  emptyLabel = USER_LABEL_EMPTY_LABEL,
  unknownLabel = USER_LABEL_UNKNOWN_LABEL,
}: UserAvatarProps) {
  if (!userId) {
    return (
      <span
        role="img"
        aria-label={emptyLabel}
        title={emptyLabel}
        className="flex size-5 shrink-0 items-center justify-center rounded-full border border-dashed border-border-strong text-muted-foreground"
      >
        <UserRound className="size-3" strokeWidth={1.5} aria-hidden="true" />
      </span>
    );
  }

  if (user === undefined) {
    return <Skeleton className="size-5 shrink-0 rounded-full" />;
  }

  const name = user ? getUserProfileDisplayName(user) : unknownLabel;

  return (
    <Avatar size="xs" role="img" aria-label={name} title={name}>
      <AvatarFallback>{user ? getUserInitials(name) : "?"}</AvatarFallback>
    </Avatar>
  );
}
