import { adminAc, defaultStatements } from "better-auth/plugins/admin/access"
import { createAccessControl } from "better-auth/plugins/access"
import {
  adminRole,
  editorRole,
  PermissionResource,
  type Permission,
  PermissionVerb,
  type Role,
  viewerRole
} from "@openvlp/types/model/rbac"

const domainResourceOrder = {
  [PermissionResource.Asset]: PermissionResource.Asset,
  [PermissionResource.Finding]: PermissionResource.Finding,
  [PermissionResource.Vulnerability]: PermissionResource.Vulnerability,
  [PermissionResource.Import]: PermissionResource.Import,
  [PermissionResource.Stats]: PermissionResource.Stats
} as const satisfies Record<PermissionResource, PermissionResource>

const domainActionOrder = {
  [PermissionVerb.Read]: PermissionVerb.Read,
  [PermissionVerb.Write]: PermissionVerb.Write,
  [PermissionVerb.Delete]: PermissionVerb.Delete
} as const satisfies Record<PermissionVerb, PermissionVerb>

export const domainResources = Object.freeze(
  Object.values(domainResourceOrder)
) as readonly PermissionResource[]

export const domainActions = Object.freeze(
  Object.values(domainActionOrder)
) as readonly PermissionVerb[]

export type DomainResource = PermissionResource
export type DomainAction = PermissionVerb

export type DomainPermissionPayload<
  Resource extends PermissionResource = PermissionResource
> = Partial<Record<Resource, readonly PermissionVerb[]>>

type DomainRoleStatement = Partial<Record<PermissionResource, PermissionVerb[]>>

export const domainStatements = domainResources.reduce(
  (statements, resource) => {
    statements[resource] = domainActions
    return statements
  },
  {} as Record<DomainResource, readonly DomainAction[]>
)

export const statements = {
  ...defaultStatements,
  ...domainStatements
} as const

export const ac = createAccessControl(statements)

export function toPermissionStatement<Resource extends PermissionResource>(
  permission: Pick<Permission, "resource" | "verb"> & { resource: Resource }
): DomainPermissionPayload<Resource> {
  return {
    [permission.resource]: [permission.verb]
  } as unknown as DomainPermissionPayload<Resource>
}

export function toPermissionStatements(
  permissions: readonly Pick<Permission, "resource" | "verb">[]
): DomainRoleStatement {
  return permissions.reduce<DomainRoleStatement>((statements, permission) => {
    const resourcePermissions = (statements[permission.resource] ??= [])
    resourcePermissions.push(permission.verb)
    return statements
  }, {})
}

export function toRoleStatement(
  role: Pick<Role, "permissions">
): DomainRoleStatement {
  return toPermissionStatements(role.permissions)
}

export const roleStatements = {
  viewer: toRoleStatement(viewerRole),
  editor: toRoleStatement(editorRole),
  admin: {
    ...adminAc.statements,
    ...toRoleStatement(adminRole)
  }
} as const

type AccessRoleStatement = Parameters<typeof ac.newRole>[0]

export const roles = {
  viewer: ac.newRole(roleStatements.viewer as AccessRoleStatement),
  editor: ac.newRole(roleStatements.editor as AccessRoleStatement),
  admin: ac.newRole(roleStatements.admin as AccessRoleStatement)
} as const

export function domainPermission<Resource extends DomainResource>(
  resource: Resource,
  action: DomainAction
) {
  return toPermissionStatement({ resource, verb: action })
}

export const userManagementPermissions = {
  read: { user: ["list"] },
  create: { user: ["create"] },
  update: { user: ["update"] }
} as const

export type UserManagementPermissionPayload =
  (typeof userManagementPermissions)[keyof typeof userManagementPermissions]

export type ApiPermissionPayload =
  | DomainPermissionPayload
  | UserManagementPermissionPayload
