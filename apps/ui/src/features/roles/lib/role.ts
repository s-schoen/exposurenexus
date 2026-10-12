import {
  PermissionResource,
  PermissionVerb,
  builtInRoleIds,
} from "@exposurenexus/contracts/model/rbac";

import { capitalizeFirstLetter } from "@/lib/format.ts";

import type { Permission } from "@exposurenexus/contracts/model/rbac";

// Resources follow the sidebar: the main entities, then settings, then cross-cutting resources.
export const PERMISSION_RESOURCE_ORDER: Array<PermissionResource> = [
  PermissionResource.Finding,
  PermissionResource.Asset,
  PermissionResource.Vulnerability,
  PermissionResource.Import,
  PermissionResource.User,
  PermissionResource.CustomField,
  PermissionResource.Session,
  PermissionResource.Stats,
];

export const PERMISSION_VERB_ORDER: Array<PermissionVerb> = [
  PermissionVerb.Read,
  PermissionVerb.Write,
  PermissionVerb.Delete,
];

function compareResources(left: PermissionResource, right: PermissionResource) {
  return PERMISSION_RESOURCE_ORDER.indexOf(left) - PERMISSION_RESOURCE_ORDER.indexOf(right);
}

function compareVerbs(left: PermissionVerb, right: PermissionVerb) {
  return PERMISSION_VERB_ORDER.indexOf(left) - PERMISSION_VERB_ORDER.indexOf(right);
}

export function comparePermissions(
  left: Pick<Permission, "resource" | "verb">,
  right: Pick<Permission, "resource" | "verb">,
): number {
  return compareResources(left.resource, right.resource) || compareVerbs(left.verb, right.verb);
}

const builtInRoleIdSet = new Set<string>(Object.values(builtInRoleIds));

export function isBuiltInRoleId(roleId: string) {
  return builtInRoleIdSet.has(roleId);
}

export function getRoleKindLabel(roleId: string) {
  return isBuiltInRoleId(roleId) ? "Built-in" : "Custom";
}

export function getUniqueRoleResources(
  permissions: ReadonlyArray<Pick<Permission, "resource">>,
): Array<PermissionResource> {
  return [...new Set(permissions.map((permission) => permission.resource))].sort(compareResources);
}

export function groupRolePermissionsByResource(
  permissions: ReadonlyArray<Permission>,
): Array<{ resource: PermissionResource; verbs: Array<PermissionVerb> }> {
  const permissionsByResource = new Map<PermissionResource, Array<PermissionVerb>>();

  for (const permission of permissions) {
    const resourcePermissions = permissionsByResource.get(permission.resource) ?? [];

    if (!resourcePermissions.includes(permission.verb)) {
      resourcePermissions.push(permission.verb);
    }

    permissionsByResource.set(permission.resource, resourcePermissions);
  }

  return [...permissionsByResource.entries()]
    .sort(([left], [right]) => compareResources(left, right))
    .map(([resource, verbs]) => ({ resource, verbs: verbs.sort(compareVerbs) }));
}

export function formatPermissionLabel(value: string) {
  return capitalizeFirstLetter(value.replaceAll("-", " "));
}
