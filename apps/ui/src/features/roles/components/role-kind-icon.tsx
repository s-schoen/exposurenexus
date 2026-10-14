import { Lock, UserCog } from "lucide-react";

import { getRoleKindLabel, isBuiltInRoleId } from "@/features/roles/lib/role.ts";
import { cn } from "@/lib/utils.ts";

interface RoleKindIconProps {
  roleId: string;
  /** Hide the icon from assistive technology when a visible label sits next to it. */
  decorative?: boolean;
  className?: string;
}

/** A lock for built-in roles and a user cog for custom ones, the role's leading icon. */
export function RoleKindIcon({ roleId, decorative = false, className }: RoleKindIconProps) {
  const Icon = isBuiltInRoleId(roleId) ? Lock : UserCog;
  const a11yProps = decorative
    ? { "aria-hidden": true }
    : { role: "img", "aria-label": getRoleKindLabel(roleId) };

  return (
    <Icon
      strokeWidth={1.5}
      className={cn("size-4 shrink-0 text-muted-foreground", className)}
      {...a11yProps}
    />
  );
}
