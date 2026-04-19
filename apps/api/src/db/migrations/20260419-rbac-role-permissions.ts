import { Kysely, sql } from "kysely"
import {
  BuiltInRoleName,
  PermissionResource,
  PermissionVerb,
  builtInRoleIds
} from "@openvlp/types/model/rbac"

const seededRoles = [
  {
    id: builtInRoleIds.viewer,
    name: BuiltInRoleName.Viewer,
    permissions: [
      { resource: PermissionResource.Asset, verb: PermissionVerb.Read },
      { resource: PermissionResource.Finding, verb: PermissionVerb.Read },
      {
        resource: PermissionResource.Vulnerability,
        verb: PermissionVerb.Read
      },
      { resource: PermissionResource.Stats, verb: PermissionVerb.Read }
    ]
  },
  {
    id: builtInRoleIds.editor,
    name: BuiltInRoleName.Editor,
    permissions: [
      { resource: PermissionResource.Asset, verb: PermissionVerb.Read },
      { resource: PermissionResource.Asset, verb: PermissionVerb.Write },
      { resource: PermissionResource.Asset, verb: PermissionVerb.Delete },
      { resource: PermissionResource.Finding, verb: PermissionVerb.Read },
      { resource: PermissionResource.Finding, verb: PermissionVerb.Write },
      { resource: PermissionResource.Finding, verb: PermissionVerb.Delete },
      {
        resource: PermissionResource.Vulnerability,
        verb: PermissionVerb.Read
      },
      {
        resource: PermissionResource.Vulnerability,
        verb: PermissionVerb.Write
      },
      {
        resource: PermissionResource.Vulnerability,
        verb: PermissionVerb.Delete
      },
      { resource: PermissionResource.Import, verb: PermissionVerb.Write },
      { resource: PermissionResource.Stats, verb: PermissionVerb.Read }
    ]
  },
  {
    id: builtInRoleIds.admin,
    name: BuiltInRoleName.Admin,
    permissions: [
      { resource: PermissionResource.Asset, verb: PermissionVerb.Read },
      { resource: PermissionResource.Asset, verb: PermissionVerb.Write },
      { resource: PermissionResource.Asset, verb: PermissionVerb.Delete },
      { resource: PermissionResource.Finding, verb: PermissionVerb.Read },
      { resource: PermissionResource.Finding, verb: PermissionVerb.Write },
      { resource: PermissionResource.Finding, verb: PermissionVerb.Delete },
      {
        resource: PermissionResource.Vulnerability,
        verb: PermissionVerb.Read
      },
      {
        resource: PermissionResource.Vulnerability,
        verb: PermissionVerb.Write
      },
      {
        resource: PermissionResource.Vulnerability,
        verb: PermissionVerb.Delete
      },
      { resource: PermissionResource.Import, verb: PermissionVerb.Write },
      { resource: PermissionResource.Stats, verb: PermissionVerb.Read },
      { resource: PermissionResource.User, verb: PermissionVerb.Read },
      { resource: PermissionResource.User, verb: PermissionVerb.Write },
      { resource: PermissionResource.User, verb: PermissionVerb.Delete }
    ]
  }
] as const

// eslint-disable-next-line
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createType("permission_resource")
    .asEnum(Object.values(PermissionResource))
    .execute()

  await db.schema
    .createType("permission_verb")
    .asEnum(Object.values(PermissionVerb))
    .execute()

  await db.schema
    .createTable("role")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().notNull().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn("name", "text", (col) => col.notNull().unique())
    .execute()

  await db.schema
    .createTable("role_permission_assignment")
    .addColumn("role_id", "uuid", (col) =>
      col.notNull().references("role.id").onDelete("cascade")
    )
    .addColumn("resource", sql`permission_resource`, (col) => col.notNull())
    .addColumn("verb", sql`permission_verb`, (col) => col.notNull())
    .addPrimaryKeyConstraint("role_permission_assignment_pkey", [
      "role_id",
      "resource",
      "verb"
    ])
    .execute()

  await db
    .insertInto("role")
    .values(seededRoles.map((role) => ({ id: role.id, name: role.name })))
    .execute()

  await db
    .insertInto("role_permission_assignment")
    .values(
      seededRoles.flatMap((role) =>
        role.permissions.map((permission) => ({
          role_id: role.id,
          resource: permission.resource,
          verb: permission.verb
        }))
      )
    )
    .execute()
}

// eslint-disable-next-line
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("role_permission_assignment").execute()
  await db.schema.dropTable("role").execute()
  await db.schema.dropType("permission_verb").execute()
  await db.schema.dropType("permission_resource").execute()
}
