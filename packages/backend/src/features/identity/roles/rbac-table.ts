import { PermissionResource, PermissionVerb } from "@exposurenexus/contracts/model/rbac";

import type { Generated } from "kysely";

export interface RoleTable {
  id: Generated<string>;
  name: string;
}

export interface RolePermissionAssignmentTable {
  roleId: string;
  resource: PermissionResource;
  verb: PermissionVerb;
}

export interface UserRoleAssignmentTable {
  roleId: string;
  userId: string;
}
