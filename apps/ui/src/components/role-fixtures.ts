import {
  BuiltInRoleName,
  PermissionResource,
  PermissionVerb,
  builtInRoleIds
} from "@openvlp/types/model/rbac"
import type { Role } from "@openvlp/types/model/rbac"

export const ROLE_FIXTURES: Array<Role> = [
  {
    id: builtInRoleIds.viewer,
    name: BuiltInRoleName.Viewer,
    permissions: [
      { resource: PermissionResource.Asset, verb: PermissionVerb.Read },
      { resource: PermissionResource.Finding, verb: PermissionVerb.Read },
      { resource: PermissionResource.Vulnerability, verb: PermissionVerb.Read },
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
      { resource: PermissionResource.Vulnerability, verb: PermissionVerb.Read },
      { resource: PermissionResource.Vulnerability, verb: PermissionVerb.Write },
      { resource: PermissionResource.Vulnerability, verb: PermissionVerb.Delete },
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
      { resource: PermissionResource.Vulnerability, verb: PermissionVerb.Read },
      { resource: PermissionResource.Vulnerability, verb: PermissionVerb.Write },
      { resource: PermissionResource.Vulnerability, verb: PermissionVerb.Delete },
      { resource: PermissionResource.Import, verb: PermissionVerb.Write },
      { resource: PermissionResource.Stats, verb: PermissionVerb.Read },
      { resource: PermissionResource.User, verb: PermissionVerb.Read },
      { resource: PermissionResource.User, verb: PermissionVerb.Write },
      { resource: PermissionResource.User, verb: PermissionVerb.Delete }
    ]
  },
  {
    id: "8f74bc56-0ac3-47ef-b7e6-8df2c42fb3c0",
    name: "security-auditor",
    permissions: [
      { resource: PermissionResource.Asset, verb: PermissionVerb.Read },
      { resource: PermissionResource.Finding, verb: PermissionVerb.Read },
      { resource: PermissionResource.Vulnerability, verb: PermissionVerb.Read },
      { resource: PermissionResource.User, verb: PermissionVerb.Read },
      { resource: PermissionResource.Stats, verb: PermissionVerb.Read }
    ]
  }
]

export const BUILT_IN_ADMIN_ROLE = ROLE_FIXTURES[2]
export const CUSTOM_AUDITOR_ROLE = ROLE_FIXTURES[3]
