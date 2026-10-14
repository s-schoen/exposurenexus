import { Boxes, Shapes } from "lucide-react";

import { DetailLayout } from "@/components/properties-panel/detail-layout.tsx";
import { DetailField, DetailFields } from "@/components/properties-panel/detail-rows.tsx";
import { DetailSection } from "@/components/properties-panel/detail-section.tsx";
import {
  PropertiesPanel,
  PropertyGroup,
  PropertyRow,
  PropertyValue,
} from "@/components/properties-panel/properties-panel.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { RoleKindIcon } from "@/features/roles/components/role-kind-icon.tsx";
import {
  formatPermissionLabel,
  getRoleKindLabel,
  getUniqueRoleResources,
  groupRolePermissionsByResource,
} from "@/features/roles/lib/role.ts";

import type { Role } from "@exposurenexus/contracts/model/rbac";

function RolePropertiesPanel({ role }: { role: Role }) {
  const resourceCount = getUniqueRoleResources(role.permissions).length;

  return (
    <PropertiesPanel>
      <PropertyGroup>
        <PropertyRow icon={Shapes} label="Type">
          <PropertyValue>
            <RoleKindIcon roleId={role.id} decorative />
            {getRoleKindLabel(role.id)}
          </PropertyValue>
        </PropertyRow>
        <PropertyRow icon={Boxes} label="Resources">
          <PropertyValue>
            <span className="tabular-nums">{resourceCount}</span>
          </PropertyValue>
        </PropertyRow>
      </PropertyGroup>
    </PropertiesPanel>
  );
}

function PermissionsSection({ role }: { role: Role }) {
  const permissionsByResource = groupRolePermissionsByResource(role.permissions);

  return (
    <DetailSection title="Permissions" count={role.permissions.length}>
      {permissionsByResource.length > 0 ? (
        <DetailFields label="Permissions">
          {permissionsByResource.map(({ resource, verbs }) => (
            <DetailField key={resource} label={formatPermissionLabel(resource)}>
              <span className="flex flex-wrap gap-1">
                {verbs.map((verb) => (
                  <Badge key={verb} variant="secondary">
                    {formatPermissionLabel(verb)}
                  </Badge>
                ))}
              </span>
            </DetailField>
          ))}
        </DetailFields>
      ) : (
        <p className="text-13 text-subtle-foreground">No permissions granted.</p>
      )}
    </DetailSection>
  );
}

interface RoleDetailContentProps {
  role: Role;
}

export function RoleDetailContent({ role }: RoleDetailContentProps) {
  return (
    <DetailLayout
      header={
        <h2 className="text-2xl leading-tight font-semibold break-words text-foreground">
          {role.name}
        </h2>
      }
      panel={<RolePropertiesPanel role={role} />}
    >
      <PermissionsSection role={role} />
    </DetailLayout>
  );
}
