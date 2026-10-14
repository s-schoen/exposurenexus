import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { UserAvatar } from "@/features/users/components/user-avatar.tsx";
import { getUserProfileDisplayName } from "@/features/users/components/user-label.tsx";

import type { UserReferenceLabels } from "@/features/users/components/user-label.tsx";
import type { UserProfile } from "@exposurenexus/contracts/model/user";
import type { ReactNode } from "react";

interface UserChipProps {
  userId: string | null;
  /** The resolved profile, `null` when it is unknown, or `undefined` while users load. */
  user: UserProfile | null | undefined;
  /** What nobody, or a user that no longer resolves, reads, such as `OWNER_LABELS`. */
  labels: UserReferenceLabels;
  /** The property the chip shows, such as "Owner", for hover. */
  title: string;
}

/** A person as a list-row property chip: avatar and name, or the placeholder for nobody. */
export function UserChip({ userId, user, labels, title }: UserChipProps) {
  let name: ReactNode;
  if (!userId) {
    name = <span className="text-muted-foreground">{labels.emptyLabel}</span>;
  } else if (user === undefined) {
    name = <Skeleton className="h-3 w-16" />;
  } else if (user === null) {
    name = <span className="text-muted-foreground">{labels.unknownLabel}</span>;
  } else {
    name = <span className="max-w-40 truncate">{getUserProfileDisplayName(user)}</span>;
  }

  return (
    <Badge variant="property" title={title}>
      <UserAvatar userId={userId} user={user} decorative />
      {name}
    </Badge>
  );
}

export interface UserOption {
  value: string;
  label: string;
  icon: ReactNode;
}

/**
 * Picker options for a person field: nobody first under `emptyValue`, then every user, each with
 * its avatar. The current user stays pickable while users load or once it no longer resolves.
 */
export function createUserOptions(
  users: ReadonlyArray<UserProfile> | undefined,
  labels: UserReferenceLabels,
  { emptyValue, currentUserId }: { emptyValue: string; currentUserId?: string | null },
): Array<UserOption> {
  const options: Array<UserOption> = [
    {
      value: emptyValue,
      label: labels.emptyLabel,
      icon: <UserAvatar userId={null} user={null} decorative />,
    },
    ...(users ?? []).map((user) => ({
      value: user.id,
      label: getUserProfileDisplayName(user),
      icon: <UserAvatar userId={user.id} user={user} decorative />,
    })),
  ];

  if (currentUserId && !options.some(({ value }) => value === currentUserId)) {
    options.push({
      value: currentUserId,
      label: users ? labels.unknownLabel : "Loading…",
      icon: <UserAvatar userId={currentUserId} user={users ? null : undefined} decorative />,
    });
  }

  return options;
}
