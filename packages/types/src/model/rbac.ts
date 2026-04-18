import { z } from "zod/v4"

export enum PermissionResource {
  Asset = "asset",
  Vulnerability = "vulnerability",
  Import = "import",
  Finding = "finding",
  Stats = "stats"
}

export enum PermissionVerb {
  Read = "read",
  Write = "write",
  Delete = "delete"
}

export enum BuiltInRoleName {
  Viewer = "viewer",
  Editor = "editor",
  Admin = "admin"
}

export const permissionSchema = z.strictObject({
  resource: z.enum(PermissionResource),
  verb: z.enum(PermissionVerb)
})

export const roleSchema = z.strictObject({
  id: z.uuidv4(),
  name: z.string().nonempty(),
  permissions: z.array(permissionSchema)
})

export type Permission = z.infer<typeof permissionSchema>
export type Role = z.infer<typeof roleSchema>

const freezePermissions = (permissions: Permission[]): Role["permissions"] =>
  Object.freeze(
    permissions.map((permission) => Object.freeze(permission))
  ) as Role["permissions"]

const freezeRole = (role: Role): Role => Object.freeze(role) as Role

export const builtInRoleIds = Object.freeze({
  [BuiltInRoleName.Viewer]: "6d0d8a47-0f6d-47b6-9b9a-d8f0d3f4dd01",
  [BuiltInRoleName.Editor]: "5d5f5c6f-a9d6-4d49-9f4d-9462b873a902",
  [BuiltInRoleName.Admin]: "0e7b7e25-47f2-4baf-a2c1-6ec48b0d8b03"
} as const)

const editorPermissions = freezePermissions([
  { resource: PermissionResource.Asset, verb: PermissionVerb.Read },
  { resource: PermissionResource.Asset, verb: PermissionVerb.Write },
  { resource: PermissionResource.Asset, verb: PermissionVerb.Delete },
  { resource: PermissionResource.Finding, verb: PermissionVerb.Read },
  { resource: PermissionResource.Finding, verb: PermissionVerb.Write },
  { resource: PermissionResource.Finding, verb: PermissionVerb.Delete },
  { resource: PermissionResource.Vulnerability, verb: PermissionVerb.Read },
  { resource: PermissionResource.Vulnerability, verb: PermissionVerb.Write },
  { resource: PermissionResource.Vulnerability, verb: PermissionVerb.Delete },
  { resource: PermissionResource.Import, verb: PermissionVerb.Write },
  { resource: PermissionResource.Stats, verb: PermissionVerb.Read }
])

export const viewerRole: Role = freezeRole({
  id: builtInRoleIds[BuiltInRoleName.Viewer],
  name: BuiltInRoleName.Viewer,
  permissions: freezePermissions([
    { resource: PermissionResource.Asset, verb: PermissionVerb.Read },
    { resource: PermissionResource.Finding, verb: PermissionVerb.Read },
    { resource: PermissionResource.Vulnerability, verb: PermissionVerb.Read },
    { resource: PermissionResource.Stats, verb: PermissionVerb.Read }
  ])
})

export const editorRole: Role = freezeRole({
  id: builtInRoleIds[BuiltInRoleName.Editor],
  name: BuiltInRoleName.Editor,
  permissions: editorPermissions
})

export const adminRole: Role = freezeRole({
  id: builtInRoleIds[BuiltInRoleName.Admin],
  name: BuiltInRoleName.Admin,
  permissions: editorPermissions
})

export const builtInRoles = Object.freeze([
  viewerRole,
  editorRole,
  adminRole
] as const)
