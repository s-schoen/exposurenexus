import { Boxes, Lock, Shapes, UserCog } from "lucide-react";

import { DetailLayout } from "@/components/properties-panel/detail-layout.tsx";
import { DetailSection } from "@/components/properties-panel/detail-section.tsx";
import {
  PropertiesPanel,
  PropertyGroup,
  PropertyRow,
  PropertyValue,
} from "@/components/properties-panel/properties-panel.tsx";
import { PropertyTray, PropertyTrayRow } from "@/components/properties-panel/property-tray.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import {
  formatPermissionLabel,
  getRoleKindLabel,
  getUniqueRoleResources,
  groupRolePermissionsByResource,
  isBuiltInRoleId,
} from "@/features/roles/lib/role.ts";

import type { Role } from "@exposurenexus/contracts/model/rbac";

function RolePropertiesPanel({ role }: { role: Role }) {
  const KindIcon = isBuiltInRoleId(role.id) ? Lock : UserCog;
  const resourceCount = getUniqueRoleResources(role.permissions).length;

  return (
    <PropertiesPanel>
      <PropertyGroup>
        <PropertyRow icon={Shapes} label="Type">
          <PropertyValue>
            <KindIcon
              className="size-4 shrink-0 text-muted-foreground"
              strokeWidth={1.5}
              aria-hidden="true"
            />
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
        <PropertyTray label="Permissions">
          {permissionsByResource.map(({ resource, verbs }) => (
            <PropertyTrayRow
              key={resource}
              trailing={verbs.map((verb) => (
                <Badge key={verb} variant="secondary">
                  {formatPermissionLabel(verb)}
                </Badge>
              ))}
            >
              <span className="truncate font-medium">{formatPermissionLabel(resource)}</span>
            </PropertyTrayRow>
          ))}
        </PropertyTray>
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
