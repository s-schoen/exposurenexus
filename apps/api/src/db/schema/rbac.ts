import { PermissionResource, PermissionVerb } from "@openvlp/types/model/rbac"

export interface RoleTable {
  id: string
  name: string
}

export interface RolePermissionAssignmentTable {
  role_id: string
  resource: PermissionResource
  verb: PermissionVerb
}
