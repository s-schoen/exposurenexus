import type { Generated } from "kysely"
import {
  PermissionResource,
  PermissionVerb
} from "@exposurenexus/types/model/rbac"

export interface RoleTable {
  id: Generated<string>
  name: string
}

export interface RolePermissionAssignmentTable {
  roleId: string
  resource: PermissionResource
  verb: PermissionVerb
}

export interface UserRoleAssignmentTable {
  roleId: string
  userId: string
}
