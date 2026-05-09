import { z } from "zod/v4"

export enum PermissionResource {
  Asset = "asset",
  CustomField = "custom-field",
  Vulnerability = "vulnerability",
  Import = "import",
  Finding = "finding",
  Session = "session",
  User = "user",
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

export const builtInRoleIds = Object.freeze({
  [BuiltInRoleName.Viewer]: "6d0d8a47-0f6d-47b6-9b9a-d8f0d3f4dd01",
  [BuiltInRoleName.Editor]: "5d5f5c6f-a9d6-4d49-9f4d-9462b873a902",
  [BuiltInRoleName.Admin]: "0e7b7e25-47f2-4baf-a2c1-6ec48b0d8b03"
} as const)

export const permissionSchema = z.strictObject({
  resource: z.enum(PermissionResource),
  verb: z.enum(PermissionVerb)
})

export const roleNameSchema = z
  .string()
  .trim()
  .min(1)
  .regex(/^[a-zA-Z0-9_-]+$/)

export const roleSchema = z.strictObject({
  id: z.uuidv4(),
  name: roleNameSchema,
  permissions: z.array(permissionSchema)
})

export const createRoleSchema = z.strictObject({
  name: roleNameSchema,
  permissions: z.array(permissionSchema)
})

export const updateRoleSchema = createRoleSchema

export type Permission = z.infer<typeof permissionSchema>
export type Role = z.infer<typeof roleSchema>
export type CreateRole = z.infer<typeof createRoleSchema>
export type UpdateRole = z.infer<typeof updateRoleSchema>
