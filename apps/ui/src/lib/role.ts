import { builtInRoleIds } from "@exposurenexus/types/model/rbac"
import type {
  Permission,
  PermissionResource,
  PermissionVerb
} from "@exposurenexus/types/model/rbac"
import { capitalizeFirstLetter } from "@/lib/format.ts"

const builtInRoleIdSet = new Set<string>(Object.values(builtInRoleIds))

export function isBuiltInRoleId(roleId: string) {
  return builtInRoleIdSet.has(roleId)
}

export function getRoleKindLabel(roleId: string) {
  return isBuiltInRoleId(roleId) ? "Built-in" : "Custom"
}

export function getUniqueRoleResources(
  permissions: ReadonlyArray<Pick<Permission, "resource">>
): Array<PermissionResource> {
  return [...new Set(permissions.map((permission) => permission.resource))]
}

export function groupRolePermissionsByResource(
  permissions: ReadonlyArray<Permission>
): Array<{ resource: PermissionResource; verbs: Array<PermissionVerb> }> {
  const permissionsByResource = new Map<
    PermissionResource,
    Array<PermissionVerb>
  >()

  for (const permission of permissions) {
    const resourcePermissions =
      permissionsByResource.get(permission.resource) ?? []

    if (!resourcePermissions.includes(permission.verb)) {
      resourcePermissions.push(permission.verb)
    }

    permissionsByResource.set(permission.resource, resourcePermissions)
  }

  return [...permissionsByResource.entries()].map(([resource, verbs]) => ({
    resource,
    verbs
  }))
}

export function formatPermissionLabel(value: string) {
  return capitalizeFirstLetter(value.replaceAll("-", " "))
}
