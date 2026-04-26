import type { Generated } from "kysely"
import { PermissionResource, PermissionVerb } from "@openvlp/types/model/rbac"

export interface RoleTable {
  id: Generated<string>
  name: string
}

export interface RolePermissionAssignmentTable {
  role_id: string
  resource: PermissionResource
  verb: PermissionVerb
}

export interface UserRoleAssignmentTable {
  roleId: string
  userId: string
}
