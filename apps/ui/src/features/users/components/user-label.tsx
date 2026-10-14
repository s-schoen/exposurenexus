import type { UserProfile } from "@exposurenexus/contracts/model/user";

export const USER_LABEL_EMPTY_LABEL = "No user";
export const USER_LABEL_UNKNOWN_LABEL = "Unknown user";

/** What a person reference reads when it is empty or no longer resolves. */
export interface UserReferenceLabels {
  emptyLabel: string;
  unknownLabel: string;
}

/** An asset's owner. Nobody reads "No owner" in chips, pickers and forms. */
export const OWNER_LABELS = {
  emptyLabel: "No owner",
  unknownLabel: "Unknown owner",
} as const satisfies UserReferenceLabels;

/** A finding's assignee. Nobody reads "Unassigned" in chips, pickers and forms. */
export const ASSIGNEE_LABELS = {
  emptyLabel: "Unassigned",
  unknownLabel: "Unknown assignee",
} as const satisfies UserReferenceLabels;

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
