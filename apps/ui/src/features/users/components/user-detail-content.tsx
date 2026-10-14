import { Link } from "@tanstack/react-router";
import { AtSign, CircleDot, Mail } from "lucide-react";

import { DetailLayout } from "@/components/properties-panel/detail-layout.tsx";
import { DetailList, DetailListItem } from "@/components/properties-panel/detail-rows.tsx";
import { DetailSection } from "@/components/properties-panel/detail-section.tsx";
import {
  PropertiesPanel,
  PropertyGroup,
  PropertyRow,
  PropertyValue,
} from "@/components/properties-panel/properties-panel.tsx";
import { RoleKindIcon } from "@/features/roles";
import { UserStatusLabel } from "@/features/users/components/user-status.tsx";

import type { Role } from "@exposurenexus/contracts/model/rbac";
import type { UserProfile } from "@exposurenexus/contracts/model/user";

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
            <UserStatusLabel enabled={user.enabled} />
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
        <DetailList label="Roles">
          {assignedRoles.map((role) => (
            <DetailListItem key={role.id}>
              <RoleKindIcon roleId={role.id} />
              <Link
                to="/settings/roles/$id"
                params={{ id: role.id }}
                className="min-w-0 flex-1 truncate font-medium hover:underline"
              >
                {role.name}
              </Link>
            </DetailListItem>
          ))}
          {unknownRoleCount > 0 && (
            <DetailListItem>
              <span className="text-subtle-foreground">
                {unknownRoleCount} unknown role{unknownRoleCount === 1 ? "" : "s"}
              </span>
            </DetailListItem>
          )}
        </DetailList>
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
