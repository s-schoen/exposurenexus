import { CircleCheck, CircleSlash } from "lucide-react";

import { cn } from "@/lib/utils.ts";

const userStatusIcons = {
  true: CircleCheck,
  false: CircleSlash,
} as const;

const userStatusIconClassNames = {
  true: "text-success",
  false: "text-subtle-foreground",
} as const;

export function formatUserStatus(enabled: boolean) {
  return enabled ? "Enabled" : "Disabled";
}

/** A user's status icon. Hidden from assistive technology: a label always sits next to it. */
export function UserStatusIcon({ enabled }: { enabled: boolean }) {
  const Icon = userStatusIcons[`${enabled}`];

  return (
    <Icon
      strokeWidth={1.5}
      className={cn("size-4 shrink-0", userStatusIconClassNames[`${enabled}`])}
      aria-hidden="true"
    />
  );
}

/** Status icon and name, for chips, pickers and property values; the parent's flex gap spaces them. */
export function UserStatusLabel({ enabled }: { enabled: boolean }) {
  return (
    <>
      <UserStatusIcon enabled={enabled} />
      {formatUserStatus(enabled)}
    </>
  );
}
