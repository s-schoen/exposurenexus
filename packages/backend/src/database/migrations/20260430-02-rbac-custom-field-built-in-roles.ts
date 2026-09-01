import {
  PermissionResource,
  PermissionVerb,
  builtInRoleIds,
} from "@exposurenexus/contracts/model/rbac";
import { type Kysely } from "kysely";

const customFieldBuiltInPermissions = [
  {
    role_id: builtInRoleIds.viewer,
    resource: PermissionResource.CustomField,
    verb: PermissionVerb.Read,
  },
  {
    role_id: builtInRoleIds.editor,
    resource: PermissionResource.CustomField,
    verb: PermissionVerb.Read,
  },
  {
    role_id: builtInRoleIds.editor,
    resource: PermissionResource.CustomField,
    verb: PermissionVerb.Write,
  },
  {
    role_id: builtInRoleIds.editor,
    resource: PermissionResource.CustomField,
    verb: PermissionVerb.Delete,
  },
  {
    role_id: builtInRoleIds.admin,
    resource: PermissionResource.CustomField,
    verb: PermissionVerb.Read,
  },
  {
    role_id: builtInRoleIds.admin,
    resource: PermissionResource.CustomField,
    verb: PermissionVerb.Write,
  },
  {
    role_id: builtInRoleIds.admin,
    resource: PermissionResource.CustomField,
    verb: PermissionVerb.Delete,
  },
] as const;

// oxlint-disable-next-line typescript/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await db
    .insertInto("role_permission_assignment")
    .values(customFieldBuiltInPermissions)
    .onConflict((oc) => oc.columns(["role_id", "resource", "verb"]).doNothing())
    .execute();
}

// oxlint-disable-next-line typescript/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await db
    .deleteFrom("role_permission_assignment")
    .where("resource", "=", PermissionResource.CustomField)
    .where("role_id", "in", Object.values(builtInRoleIds))
    .execute();
}
