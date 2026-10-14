import { UserRound } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  USER_LABEL_EMPTY_LABEL,
  USER_LABEL_UNKNOWN_LABEL,
  getUserProfileDisplayName,
} from "@/features/users/components/user-label.tsx";
import { cn } from "@/lib/utils.ts";

import type { UserProfile } from "@exposurenexus/contracts/model/user";

export function getUserInitials(name: string): string {
  const words = name
    .trim()
    .split(/[\s._@-]+/)
    .filter(Boolean);
  const initials = words.length > 1 ? words[0][0] + words[1][0] : (words[0]?.slice(0, 2) ?? "");

  return initials.toUpperCase() || "?";
}

const avatarSizeClassNames = {
  xs: "size-5",
  md: "size-7",
} as const;

const placeholderIconSizeClassNames = {
  xs: "size-3",
  md: "size-4",
} as const;

interface UserAvatarProps {
  userId: string | null;
  /** The resolved profile, `null` when it is unknown, or `undefined` while users load. */
  user: UserProfile | null | undefined;
  emptyLabel?: string;
  unknownLabel?: string;
  /** `xs` (20px) for rows, chips and pickers; `md` (28px) for the account menu. */
  size?: keyof typeof avatarSizeClassNames;
  /** Hide the avatar from assistive technology when a visible name sits next to it. */
  decorative?: boolean;
}

// The one picture of a person: two initials, or a dashed placeholder for nobody. It is named for
// assistive technology and hover by the user's name unless a visible name sits next to it.
export function UserAvatar({
  userId,
  user,
  emptyLabel = USER_LABEL_EMPTY_LABEL,
  unknownLabel = USER_LABEL_UNKNOWN_LABEL,
  size = "xs",
  decorative = false,
}: UserAvatarProps) {
  const nameProps = (name: string) =>
    decorative
      ? { "aria-hidden": true as const }
      : { role: "img" as const, "aria-label": name, title: name };

  if (!userId) {
    return (
      <span
        {...nameProps(emptyLabel)}
        className={cn(
          "flex shrink-0 items-center justify-center rounded-full border border-dashed border-border-strong text-muted-foreground",
          avatarSizeClassNames[size],
        )}
      >
        <UserRound
          className={placeholderIconSizeClassNames[size]}
          strokeWidth={1.5}
          aria-hidden="true"
        />
      </span>
    );
  }

  if (user === undefined) {
    return size === "md" ? (
      <Skeleton className="size-7 shrink-0 rounded-full" />
    ) : (
      <Skeleton className="size-5 shrink-0 rounded-full" />
    );
  }

  const name = user ? getUserProfileDisplayName(user) : unknownLabel;
  const initials = <AvatarFallback>{user ? getUserInitials(name) : "?"}</AvatarFallback>;

  return size === "md" ? (
    <Avatar className="size-7" {...nameProps(name)}>
      {initials}
    </Avatar>
  ) : (
    <Avatar size="xs" {...nameProps(name)}>
      {initials}
    </Avatar>
  );
}
