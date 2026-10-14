import { useNavigate } from "@tanstack/react-router";
import { Pencil, UserRoundCheck, UserRoundX } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";

import { useSignedInUser } from "@/features/auth";
import { useUserLifecycle } from "@/features/users/hooks/use-user-lifecycle.ts";
import { useStableCallback } from "@/hooks/use-stable-callback.ts";

import type { DataListBulkAction } from "@/components/data-list/data-list.tsx";
import type { PageAction } from "@/hooks/use-page-meta.tsx";
import type { UserProfile } from "@exposurenexus/contracts/model/user";

const SELF_DISABLE_MESSAGE = "You can't disable your own account";

/** Enables or disables users. Your own account is never disabled: it is skipped with a note. */
export function useSetUsersEnabled() {
  const userLifecycle = useUserLifecycle();
  const currentUser = useSignedInUser();

  return useStableCallback(async (users: Array<UserProfile>, enabled: boolean) => {
    const targets = enabled ? users : users.filter((user) => user.id !== currentUser?.id);

    if (targets.length < users.length) {
      toast.info(SELF_DISABLE_MESSAGE);
    }

    if (targets.length > 0) {
      await userLifecycle.setUsersEnabled(targets, enabled);
    }
  });
}

/** Bulk Enable and Disable for the users list; each shows only when it would change a user. */
export function useUserBulkActions() {
  const setUsersEnabled = useSetUsersEnabled();

  return useMemo<Array<DataListBulkAction<UserProfile>>>(
    () => [
      {
        label: "Enable",
        icon: UserRoundCheck,
        appliesTo: (user) => !user.enabled,
        onAction: (users) => setUsersEnabled(users, true),
      },
      {
        label: "Disable",
        icon: UserRoundX,
        appliesTo: (user) => user.enabled,
        onAction: (users) => setUsersEnabled(users, false),
      },
    ],
    [setUsersEnabled],
  );
}

/** The user's ⋯ menu on their detail page and peek. Users are disabled, never deleted. */
export function useUserRecordActions(user: UserProfile) {
  const navigate = useNavigate();
  const setUsersEnabled = useSetUsersEnabled();
  const currentUser = useSignedInUser();
  const isCurrentUser = user.id === currentUser?.id;

  return useMemo<Array<PageAction>>(
    () => [
      {
        label: "Edit user",
        icon: Pencil,
        onClick: () => {
          void navigate({ to: "/settings/users/$id/edit", params: { id: user.id } });
        },
      },
      user.enabled
        ? {
            label: "Disable user",
            icon: UserRoundX,
            disabled: isCurrentUser,
            onClick: () => void setUsersEnabled([user], false),
          }
        : {
            label: "Enable user",
            icon: UserRoundCheck,
            onClick: () => void setUsersEnabled([user], true),
          },
    ],
    [isCurrentUser, navigate, setUsersEnabled, user],
  );
}
