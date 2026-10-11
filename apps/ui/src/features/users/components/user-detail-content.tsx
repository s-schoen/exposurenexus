import { Link } from "@tanstack/react-router";
import { AtSign, CircleDot, KeyRound, Mail } from "lucide-react";

import { DetailLayout } from "@/components/properties-panel/detail-layout.tsx";
import { DetailSection } from "@/components/properties-panel/detail-section.tsx";
import {
  PropertiesPanel,
  PropertyGroup,
  PropertyRow,
  PropertyValue,
} from "@/components/properties-panel/properties-panel.tsx";
import { cn } from "@/lib/utils.ts";

import type { Role } from "@exposurenexus/contracts/model/rbac";
import type { UserProfile } from "@exposurenexus/contracts/model/user";

const enabledDotClassNames = {
  true: "bg-success",
  false: "bg-subtle-foreground",
} as const;

function UserPropertiesPanel({ user }: { user: UserProfile }) {
  return (
    <PropertiesPanel>
      <PropertyGroup>
        <PropertyRow icon={AtSign} label="Username">
          <PropertyValue>
            <span className="truncate font-mono text-xs">{user.username}</span>
          </PropertyValue>
        </PropertyRow>
        <PropertyRow icon={Mail} label="Email">
          <PropertyValue>
            <span className="truncate">{user.email}</span>
          </PropertyValue>
        </PropertyRow>
        <PropertyRow icon={CircleDot} label="Status">
          <PropertyValue>
            <span
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                enabledDotClassNames[`${user.enabled}`],
              )}
              aria-hidden="true"
            />
            {user.enabled ? "Enabled" : "Disabled"}
          </PropertyValue>
        </PropertyRow>
      </PropertyGroup>
    </PropertiesPanel>
  );
}

function RolesSection({ user, roles }: { user: UserProfile; roles: ReadonlyArray<Role> }) {
  const roleById = new Map(roles.map((role) => [role.id, role]));
  const assignedRoles = user.roleIds.flatMap((roleId) => {
    const role = roleById.get(roleId);
    return role ? [role] : [];
  });
  const unknownRoleCount = user.roleIds.length - assignedRoles.length;

  return (
    <DetailSection title="Roles" count={user.roleIds.length}>
      {user.roleIds.length > 0 ? (
        <ul className="flex flex-col">
          {assignedRoles.map((role) => (
            <li
              key={role.id}
              className="-mx-2 flex h-9 items-center gap-2 rounded-md px-2 transition-colors duration-100 hover:bg-accent"
            >
              <KeyRound
                className="size-4 shrink-0 text-muted-foreground"
                strokeWidth={1.5}
                aria-hidden="true"
              />
              <Link
                to="/settings/roles/$id"
                params={{ id: role.id }}
                className="min-w-0 flex-1 truncate text-13 font-medium text-foreground hover:underline"
              >
                {role.name}
              </Link>
            </li>
          ))}
          {unknownRoleCount > 0 && (
            <li className="flex h-9 items-center text-13 text-subtle-foreground">
              {unknownRoleCount} unknown role{unknownRoleCount === 1 ? "" : "s"}
            </li>
          )}
        </ul>
      ) : (
        <p className="text-13 text-subtle-foreground">No roles assigned.</p>
      )}
    </DetailSection>
  );
}

interface UserDetailContentProps {
  user: UserProfile;
  roles: Array<Role>;
}

export function UserDetailContent({ user, roles }: UserDetailContentProps) {
  return (
    <DetailLayout
      header={
        <h2 className="text-2xl leading-tight font-semibold break-words text-foreground">
          {user.displayName}
        </h2>
      }
      panel={<UserPropertiesPanel user={user} />}
    >
      <RolesSection user={user} roles={roles} />
    </DetailLayout>
  );
}
