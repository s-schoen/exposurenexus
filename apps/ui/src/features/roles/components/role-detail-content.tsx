import { KeyRound } from "lucide-react";

import { DetailHighlightCard } from "@/components/detail-highlight-card.tsx";
import { MetadataSidebar } from "@/components/metadata-sidebar/index.tsx";
import { MetadataDetailRow } from "@/components/metadata-sidebar/metadata-detail-row.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import {
  formatPermissionLabel,
  getRoleKindLabel,
  getUniqueRoleResources,
  groupRolePermissionsByResource,
  isBuiltInRoleId,
} from "@/features/roles/lib/role.ts";

import type { Role } from "@exposurenexus/contracts/model/rbac";
import type { ReactNode } from "react";

interface RoleDetailContentProps {
  role: Role;
  titleAction?: ReactNode;
}

function RoleTypeBadge({ roleId }: { roleId: string }) {
  const kind = getRoleKindLabel(roleId);

  return (
    <Badge
      variant="outline"
      className={
        kind === "Built-in"
          ? "rounded-md border-sky-200 bg-sky-50 text-sky-700"
          : "rounded-md border-violet-200 bg-violet-50 text-violet-700"
      }
    >
      <KeyRound className="size-3" />
      {kind}
    </Badge>
  );
}

export function RoleDetailContent({ role: roleData, titleAction }: RoleDetailContentProps) {
  const kindLabel = getRoleKindLabel(roleData.id);
  const resources = getUniqueRoleResources(roleData.permissions);
  const permissionsByResource = groupRolePermissionsByResource(roleData.permissions);

  const overview = (
    <Card className="border-border/60 bg-shell-panel shadow-(--shell-shadow)">
      <CardHeader className="gap-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">{titleAction}</div>
          <RoleTypeBadge roleId={roleData.id} />
        </div>
        <div className="space-y-3">
          <div className="space-y-2">
            <CardTitle className="text-2xl font-semibold tracking-tight">{roleData.name}</CardTitle>
            <CardDescription className="max-w-3xl text-sm leading-6">
              Roles define which resources a user can read, write, or delete across the platform.
            </CardDescription>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <DetailHighlightCard
              label="Role name"
              value={roleData.name}
              description="Stored identifier used by the API and auth system"
            />
            <DetailHighlightCard
              label="Type"
              value={kindLabel}
              description="Whether the role is protected by the platform"
            />
            <DetailHighlightCard
              label="Permissions"
              value={`${roleData.permissions.length}`}
              description="Individual grants configured for this role"
            />
            <DetailHighlightCard
              label="Resources"
              value={`${resources.length}`}
              description="Unique resource groups covered by the role"
            />
          </div>
        </div>
      </CardHeader>
    </Card>
  );

  const permissions = (
    <Card className="border-border/60 bg-shell-panel shadow-(--shell-shadow)">
      <CardHeader>
        <CardTitle>Permissions</CardTitle>
        <CardDescription>
          Grants are grouped by resource to show how this role maps onto the API authorization
          model.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {permissionsByResource.map((permissionGroup) => (
          <div
            key={permissionGroup.resource}
            className="rounded-2xl border border-border/70 bg-muted/20 p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-foreground">
                {formatPermissionLabel(permissionGroup.resource)}
              </div>
              <Badge variant="outline" className="rounded-full">
                {permissionGroup.verbs.length} grant
                {permissionGroup.verbs.length === 1 ? "" : "s"}
              </Badge>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {permissionGroup.verbs.map((verb) => (
                <Badge key={verb} variant="secondary" className="rounded-full">
                  {formatPermissionLabel(verb)}
                </Badge>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );

  const sidebar = (
    <MetadataSidebar title="Role details" icon={KeyRound}>
      <div className="space-y-3">
        <MetadataDetailRow label="Name" value={roleData.name} />
        <MetadataDetailRow label="Type" value={kindLabel} />
        <MetadataDetailRow label="Protected" value={isBuiltInRoleId(roleData.id) ? "Yes" : "No"} />
        <MetadataDetailRow
          label="Resources"
          value={
            <div className="flex max-w-[16rem] flex-wrap justify-end gap-1">
              {resources.map((resource) => (
                <Badge key={resource} variant="outline" className="rounded-full">
                  {formatPermissionLabel(resource)}
                </Badge>
              ))}
            </div>
          }
        />
        <MetadataDetailRow label="Permissions" value={`${roleData.permissions.length}`} />
      </div>
    </MetadataSidebar>
  );

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex min-w-0 flex-col gap-4">
        {overview}
        {permissions}
      </div>
      {sidebar}
    </div>
  );
}
