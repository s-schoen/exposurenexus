import {
  PermissionResource,
  type Permission,
  PermissionVerb
} from "@exposurenexus/types/model/rbac"

// assignment of verbs to resources
export type ResourcePermissionVerbAssignment = Partial<
  Record<PermissionResource, PermissionVerb[]>
>

export type DomainPermissionPayload<
  Resource extends PermissionResource = PermissionResource
> = ResourcePermissionVerbAssignment &
  Partial<Record<Resource, readonly PermissionVerb[]>>

/**
 * Converts a single shared permission object into the grouped resource -> verbs
 * shape used by app-owned authorization checks.
 */
export function groupPermission<Resource extends PermissionResource>(
  permission: Pick<Permission, "resource" | "verb"> & { resource: Resource }
): DomainPermissionPayload<Resource> {
  // TS cannot preserve the exact computed key in this object literal, so the
  // function boundary keeps the cast contained to one place.
  return {
    [permission.resource]: [permission.verb]
  } as unknown as DomainPermissionPayload<Resource>
}

/**
 * Groups shared permissions by resource.
 */
export function toPermissionStatements(
  permissions: readonly Pick<Permission, "resource" | "verb">[]
): ResourcePermissionVerbAssignment {
  const groupedPermissions: ResourcePermissionVerbAssignment = {}

  for (const permission of permissions) {
    const groupedPermission = groupPermission(permission)

    for (const [resource, actions] of Object.entries(groupedPermission)) {
      const typedResource = resource as PermissionResource
      const existingActions = groupedPermissions[typedResource]

      if (!existingActions) {
        groupedPermissions[typedResource] = [...actions]
        continue
      }

      for (const action of actions) {
        if (!existingActions.includes(action)) {
          existingActions.push(action)
        }
      }
    }
  }

  return groupedPermissions
}

/**
 * Creates a canonical shared permission object for route-level authorization
 * checks inside the API.
 */
export function domainPermission<Resource extends PermissionResource>(
  resource: Resource,
  action: PermissionVerb
): Permission {
  return { resource, verb: action }
}
