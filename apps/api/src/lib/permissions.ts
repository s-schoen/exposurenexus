import { adminAc, defaultStatements } from "better-auth/plugins/admin/access"
import { createAccessControl } from "better-auth/plugins/access"
import {
  BuiltInRoleName,
  PermissionResource,
  type Permission,
  PermissionVerb,
  type Role
} from "@openvlp/types/model/rbac"

// better-auth native actions that the admin plugin checks on the user resource.
type BetterAuthUserVerb = (typeof defaultStatements.user)[number]

// better-auth native actions that the admin plugin checks on the session resource.
type BetterAuthSessionVerb = (typeof defaultStatements.session)[number]

// assignment of verbs to resources
export type ResourcePermissionVerbAssignment = Partial<
  Record<PermissionResource, PermissionVerb[]>
>

// Action vocabulary for each resource in the merged access-control model.
// Most resources use shared PermissionVerb values, while user/session also allow
// Better Auth native admin actions.
type AccessControlVerbMap = {
  [PermissionResource.Asset]: PermissionVerb
  [PermissionResource.Finding]: PermissionVerb
  // The user resource is shared between domain RBAC and better-auth admin.
  // We allow both the coarse app-level verbs and Better Auth's native actions here
  // so one role definition can drive both /api/users and /api/auth/admin/*.
  [PermissionResource.User]: PermissionVerb | BetterAuthUserVerb
  // Session is a shared resource too, but built-in roles still inherit it from
  // user management instead of storing separate session permissions directly.
  [PermissionResource.Session]: PermissionVerb | BetterAuthSessionVerb
  [PermissionResource.Vulnerability]: PermissionVerb
  [PermissionResource.Import]: PermissionVerb
  [PermissionResource.Stats]: PermissionVerb
}

// statement shape consumed by better-auth when defining roles.
type BetterAuthResourcePermissionVerbAssignment = Partial<{
  [Resource in PermissionResource]: readonly AccessControlVerbMap[Resource][]
}>

// mutable builder variant of BetterAuthRolePermissionAssignment used while we
// merge readonly statement fragments.
type MutableBetterAuthResourcePermissionVerbAssignment = Partial<{
  [Resource in PermissionResource]: AccessControlVerbMap[Resource][]
}>

/**
 * Merges verbs for a single resource while preserving insertion order and
 * deduplicating repeated values.
 */
function mergeResourceVerbs<Resource extends PermissionResource>(
  merged: MutableBetterAuthResourcePermissionVerbAssignment,
  resource: Resource,
  verbMaps: readonly AccessControlVerbMap[Resource][]
) {
  const existingVerbs =
    (merged[resource] as AccessControlVerbMap[Resource][] | undefined) ?? []

  for (const verbMap of verbMaps) {
    if (!existingVerbs.includes(verbMap)) {
      existingVerbs.push(verbMap)
    }
  }

  merged[resource] =
    existingVerbs as MutableBetterAuthResourcePermissionVerbAssignment[Resource]
}

/**
 * Combines permission verb assignments into a better-auth compatible map.
 */
function mergeResourcePermissions(
  ...statements: readonly BetterAuthResourcePermissionVerbAssignment[]
): BetterAuthResourcePermissionVerbAssignment {
  const merged: MutableBetterAuthResourcePermissionVerbAssignment = {}

  for (const statement of statements) {
    for (const [resource, actions] of Object.entries(statement)) {
      const typedResource = resource as PermissionResource

      if (actions) {
        mergeResourceVerbs(merged, typedResource, actions)
      }
    }
  }

  return merged as BetterAuthResourcePermissionVerbAssignment
}

/**
 * Builds the shared resource -> read/write/delete statement map that registers
 * domain resources with better-auth access-control plugin.
 */
function buildDomainRessourceVerbAssignments(): ResourcePermissionVerbAssignment {
  const statements: ResourcePermissionVerbAssignment = {}

  for (const resource of Object.values(PermissionResource)) {
    statements[resource] = Object.values(PermissionVerb)
  }

  return statements
}

export type DomainPermissionPayload<
  Resource extends PermissionResource = PermissionResource
> = ResourcePermissionVerbAssignment &
  Partial<Record<Resource, readonly PermissionVerb[]>>

export const statements = mergeResourcePermissions(
  defaultStatements,
  buildDomainRessourceVerbAssignments()
)

export const ac = createAccessControl(statements)

/**
 * Converts a single shared permission object into the grouped resource -> verbs
 * shape used at the Better Auth API boundary.
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
 * Groups shared permissions by resource without expanding them into Better Auth
 * native admin actions.
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
 * Expands domain permissions into the richer statement shape required
 * by better-auth admin access-control plugin.
 */
export function toBetterAuthPermissionAssignment(
  permissions: readonly Pick<Permission, "resource" | "verb">[]
): BetterAuthResourcePermissionVerbAssignment {
  let groupedPermissions: BetterAuthResourcePermissionVerbAssignment = {}

  for (const permission of permissions) {
    groupedPermissions = mergeResourcePermissions(
      groupedPermissions,
      betterAuthPermission(permission)
    )
  }

  return groupedPermissions
}

/**
 * Expands a shared session permission into the Better Auth actions that protect
 * session-related admin endpoints.
 */
function mapSessionPermissionToBetterAuth(
  permission: Pick<Permission, "resource" | "verb"> & {
    resource: PermissionResource.Session
  }
): BetterAuthResourcePermissionVerbAssignment {
  const sharedPermission = groupPermission(permission)

  switch (permission.verb) {
    case PermissionVerb.Read:
      return mergeResourcePermissions(sharedPermission, {
        session: ["list"]
      })
    case PermissionVerb.Write:
      return mergeResourcePermissions(sharedPermission, {
        session: ["revoke"]
      })
    case PermissionVerb.Delete:
      return mergeResourcePermissions(sharedPermission, {
        session: ["delete"]
      })
  }
}

/**
 * Expands a shared user permission into the Better Auth actions that protect
 * user and derived session admin endpoints.
 */
function mapUserPermissionToBetterAuth(
  permission: Pick<Permission, "resource" | "verb"> & {
    resource: PermissionResource.User
  }
): BetterAuthResourcePermissionVerbAssignment {
  const sharedPermission = groupPermission(permission)

  switch (permission.verb) {
    case PermissionVerb.Read:
      return mergeResourcePermissions(sharedPermission, {
        user: ["list", "get"]
      })
    case PermissionVerb.Write:
      return mergeResourcePermissions(
        sharedPermission,
        mapSessionPermissionToBetterAuth({
          resource: PermissionResource.Session,
          verb: PermissionVerb.Read
        }),
        mapSessionPermissionToBetterAuth({
          resource: PermissionResource.Session,
          verb: PermissionVerb.Write
        }),
        {
          user: [
            "create",
            "update",
            "set-role",
            "set-password",
            "ban",
            "impersonate"
          ]
        }
      )
    case PermissionVerb.Delete:
      return mergeResourcePermissions(sharedPermission, {
        user: ["delete"]
      })
  }
}

/**
 * Maps one shared permission to the better-auth statement fragment needed to
 * authorize both app-owned routes and better-auth admin endpoints.
 */
export function betterAuthPermission(
  permission: Pick<Permission, "resource" | "verb">
): BetterAuthResourcePermissionVerbAssignment {
  if (permission.resource === PermissionResource.Session) {
    return mapSessionPermissionToBetterAuth({
      resource: PermissionResource.Session,
      verb: permission.verb
    })
  }

  if (permission.resource !== PermissionResource.User) {
    return groupPermission(permission)
  }

  // better-auth admin endpoints do not understand our coarse user.read/write
  // verbs, so we expand them into the native actions that Better Auth checks.
  // User management currently implies session management. We keep that
  // derivation in the bridge layer instead of persisting separate session
  // grants on the shared built-in roles.
  return mapUserPermissionToBetterAuth({
    resource: PermissionResource.User,
    verb: permission.verb
  })
}

/**
 * Builds the Better Auth access-control statement for a shared role definition.
 */
export function toRoleStatement(
  role: Pick<Role, "permissions">
): BetterAuthResourcePermissionVerbAssignment {
  return toBetterAuthPermissionAssignment(role.permissions)
}

type AccessRoleStatement = Parameters<typeof ac.newRole>[0]

export type BetterAuthRoleStatements = Record<
  string,
  BetterAuthResourcePermissionVerbAssignment
>

export type BetterAuthRoles = Record<string, ReturnType<typeof ac.newRole>>

export function buildBetterAuthRoleConfig(runtimeRoles: readonly Role[]): {
  roleStatements: BetterAuthRoleStatements
  roles: BetterAuthRoles
} {
  const roleStatements = Object.fromEntries(
    runtimeRoles.map((role) => {
      const roleStatement =
        role.name === BuiltInRoleName.Admin
          ? mergeResourcePermissions(adminAc.statements, toRoleStatement(role))
          : toRoleStatement(role)

      return [role.name, roleStatement]
    })
  ) as BetterAuthRoleStatements

  const roles = Object.fromEntries(
    Object.entries(roleStatements).map(([roleName, roleStatement]) => [
      roleName,
      ac.newRole(roleStatement as AccessRoleStatement)
    ])
  ) as BetterAuthRoles

  return {
    roleStatements,
    roles
  }
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

export type ApiPermissionPayload = ResourcePermissionVerbAssignment
