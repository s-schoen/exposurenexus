import { useQuery } from "@tanstack/react-query";
import { Mail, User as UserIcon } from "lucide-react";

import { createListRolesQueryOptions } from "@/api/role.ts";
import { createUserByIDQueryOptions } from "@/api/user.ts";
import { DetailHighlightCard } from "@/components/detail-highlight-card.tsx";
import { DetailQueryBoundary } from "@/components/detail-query-boundary.tsx";
import { MetadataSidebar } from "@/components/metadata-sidebar";
import { MetadataDetailRow } from "@/components/metadata-sidebar/metadata-detail-row.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";

import type { ReactNode } from "react";

interface UserDetailContentProps {
  userId: string;
  titleAction?: ReactNode;
}

function UserStatusBadge({ enabled }: { enabled: boolean }) {
  return (
    <Badge
      variant="outline"
      className={
        enabled
          ? "rounded-full border-emerald-200 bg-emerald-50 text-emerald-700"
          : "rounded-full border-amber-200 bg-amber-50 text-amber-700"
      }
    >
      {enabled ? "Enabled" : "Disabled"}
    </Badge>
  );
}

export function UserDetailContent({ userId, titleAction }: UserDetailContentProps) {
  const user = useQuery(createUserByIDQueryOptions(userId));
  const roles = useQuery(createListRolesQueryOptions());

  function renderUserDetail(userData: NonNullable<typeof user.data>) {
    const displayName = userData.displayName;
    const roleLabelById = new Map((roles.data ?? []).map((role) => [role.id, role.name]));
    const resolvedRoleLabels = userData.roleIds.flatMap((roleId) => {
      const roleLabel = roleLabelById.get(roleId);
      return roleLabel ? [roleLabel] : [];
    });
    const unresolvedRoleCount = Math.max(userData.roleIds.length - resolvedRoleLabels.length, 0);

    function UserRoleBadges({ compact = false }: { compact?: boolean }) {
      if (userData.roleIds.length === 0) {
        return <span className="text-muted-foreground">No roles</span>;
      }

      if (roles.isPending) {
        return <span className="text-muted-foreground">Loading roles...</span>;
      }

      if (!roles.data) {
        return (
          <span className="text-muted-foreground">
            {userData.roleIds.length} role
            {userData.roleIds.length === 1 ? "" : "s"} assigned
          </span>
        );
      }

      return (
        <div
          className={
            compact ? "flex max-w-[16rem] flex-wrap justify-end gap-1" : "flex flex-wrap gap-2"
          }
        >
          {resolvedRoleLabels.map((roleLabel) => (
            <Badge key={roleLabel} variant="outline" className="rounded-full">
              {roleLabel}
            </Badge>
          ))}
          {unresolvedRoleCount > 0 && (
            <Badge variant="outline" className="rounded-full text-muted-foreground">
              +{unresolvedRoleCount} unknown
            </Badge>
          )}
        </div>
      );
    }

    function UserOverviewCard() {
      const username = userData.username;

      return (
        <Card className="border-border/60 bg-shell-panel shadow-(--shell-shadow)">
          <CardHeader className="gap-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">{titleAction}</div>
              <UserStatusBadge enabled={userData.enabled} />
            </div>
            <div className="space-y-3">
              <div className="space-y-2">
                <CardTitle className="text-2xl font-semibold tracking-tight">
                  {displayName}
                </CardTitle>
                <CardDescription className="max-w-3xl text-sm leading-6">
                  Platform user account with access credentials, profile identifiers, and role
                  assignments.
                </CardDescription>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <DetailHighlightCard
                  label="Email"
                  value={userData.email}
                  description="Primary contact and sign-in address"
                />
                <DetailHighlightCard
                  label="Username"
                  value={username}
                  description="Unique sign-in handle for the account"
                />
                <DetailHighlightCard
                  label="Status"
                  value={<UserStatusBadge enabled={userData.enabled} />}
                  description="Whether the user can authenticate"
                />
                <DetailHighlightCard
                  label="Roles"
                  value={<UserRoleBadges />}
                  description="Assigned access roles for the account"
                />
              </div>
            </div>
          </CardHeader>
        </Card>
      );
    }

    function UserProfileCard() {
      const username = userData.username;

      return (
        <Card className="border-border/60 bg-shell-panel shadow-(--shell-shadow)">
          <CardHeader className="gap-2">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <CardTitle className="text-xl font-semibold">Profile</CardTitle>
                <CardDescription>
                  Identity fields stored by the ExposureNexus user profile service.
                </CardDescription>
              </div>
              <Badge variant="outline" className="rounded-md">
                <Mail className="size-3" />
                Account
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <div className="text-sm font-medium text-foreground">Display name</div>
              <div className="rounded-xl border border-border/70 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                {displayName}
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium text-foreground">Email</div>
              <div className="rounded-xl border border-border/70 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                {userData.email}
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium text-foreground">Username</div>
              <div className="rounded-xl border border-border/70 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                {username}
              </div>
            </div>
          </CardContent>
        </Card>
      );
    }

    function UserSidebar() {
      const username = userData.username;

      return (
        <MetadataSidebar title="User details" icon={UserIcon}>
          <div className="space-y-3">
            <MetadataDetailRow label="Display name" value={displayName} />
            <MetadataDetailRow label="Email" value={userData.email} />
            <MetadataDetailRow label="Username" value={username} />
            <MetadataDetailRow label="Status" value={userData.enabled ? "Enabled" : "Disabled"} />
            <MetadataDetailRow label="Roles" value={<UserRoleBadges compact />} />
          </div>
        </MetadataSidebar>
      );
    }

    return (
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <UserOverviewCard />
          <UserProfileCard />
        </div>
        <UserSidebar />
      </div>
    );
  }

  return (
    <DetailQueryBoundary
      query={user}
      title="User details"
      errorTitle="Unable to load user"
      errorDescription="The selected user could not be loaded."
      missingMessage="The API did not return a user record."
    >
      {renderUserDetail}
    </DetailQueryBoundary>
  );
}
