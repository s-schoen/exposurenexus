import { describe, expect, it } from "vitest"
import {
  BuiltInRoleName,
  PermissionResource,
  PermissionVerb,
  builtInRoleIds
} from "@openvlp/types/model/rbac"
import {
  betterAuthPermission,
  buildBetterAuthRoleConfig,
  domainPermission,
  groupPermission,
  toPermissionStatements,
  toBetterAuthPermissionAssignment,
  toRoleStatement
} from "./permissions.js"

describe("rbac permissions", () => {
  it("builds shared permission objects for route middleware", () => {
    expect(
      domainPermission(PermissionResource.Asset, PermissionVerb.Read)
    ).toEqual({
      resource: PermissionResource.Asset,
      verb: PermissionVerb.Read
    })
    expect(
      domainPermission(PermissionResource.Finding, PermissionVerb.Delete)
    ).toEqual({
      resource: PermissionResource.Finding,
      verb: PermissionVerb.Delete
    })
    expect(
      domainPermission(PermissionResource.Stats, PermissionVerb.Delete)
    ).toEqual({
      resource: PermissionResource.Stats,
      verb: PermissionVerb.Delete
    })
    expect(
      domainPermission(PermissionResource.User, PermissionVerb.Write)
    ).toEqual({
      resource: PermissionResource.User,
      verb: PermissionVerb.Write
    })
    expect(
      domainPermission(PermissionResource.Session, PermissionVerb.Read)
    ).toEqual({
      resource: PermissionResource.Session,
      verb: PermissionVerb.Read
    })
    expect(
      groupPermission({
        resource: PermissionResource.Session,
        verb: PermissionVerb.Read
      })
    ).toEqual({
      session: ["read"]
    })
  })

  it("groups shared permissions and adapts them into Better Auth statements", () => {
    expect(
      groupPermission({
        resource: PermissionResource.Asset,
        verb: PermissionVerb.Read
      })
    ).toEqual({ asset: ["read"] })

    expect(
      toPermissionStatements([
        { resource: PermissionResource.Asset, verb: PermissionVerb.Read },
        { resource: PermissionResource.Asset, verb: PermissionVerb.Write },
        { resource: PermissionResource.Stats, verb: PermissionVerb.Read }
      ])
    ).toEqual({
      asset: ["read", "write"],
      stats: ["read"]
    })

    expect(
      toBetterAuthPermissionAssignment([
        { resource: PermissionResource.Asset, verb: PermissionVerb.Read },
        { resource: PermissionResource.Asset, verb: PermissionVerb.Write },
        { resource: PermissionResource.Stats, verb: PermissionVerb.Read }
      ])
    ).toEqual({
      asset: ["read", "write"],
      stats: ["read"]
    })

    expect(
      betterAuthPermission({
        resource: PermissionResource.Session,
        verb: PermissionVerb.Write
      })
    ).toEqual({
      session: ["write", "revoke"]
    })

    expect(
      betterAuthPermission({
        resource: PermissionResource.User,
        verb: PermissionVerb.Write
      })
    ).toEqual({
      session: ["read", "list", "write", "revoke"],
      user: [
        "write",
        "create",
        "update",
        "set-role",
        "set-password",
        "ban",
        "impersonate"
      ]
    })
  })

  it("derives viewer, editor, and admin role grants from the shared built-in roles", () => {
    const viewerRole = {
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
    }
    const editorRole = {
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
    }
    const adminRole = {
      id: builtInRoleIds.admin,
      name: BuiltInRoleName.Admin,
      permissions: [
        ...editorRole.permissions,
        { resource: PermissionResource.User, verb: PermissionVerb.Read },
        { resource: PermissionResource.User, verb: PermissionVerb.Write },
        { resource: PermissionResource.User, verb: PermissionVerb.Delete }
      ]
    }
    const builtRoles = [viewerRole, editorRole, adminRole]

    expect(toRoleStatement(viewerRole)).toEqual({
      asset: ["read"],
      finding: ["read"],
      vulnerability: ["read"],
      stats: ["read"]
    })

    expect(toRoleStatement(editorRole)).toEqual({
      asset: ["read", "write", "delete"],
      finding: ["read", "write", "delete"],
      vulnerability: ["read", "write", "delete"],
      import: ["write"],
      stats: ["read"]
    })

    expect(toRoleStatement(adminRole)).toEqual({
      asset: ["read", "write", "delete"],
      finding: ["read", "write", "delete"],
      session: ["read", "list", "write", "revoke"],
      user: [
        "read",
        "list",
        "get",
        "write",
        "create",
        "update",
        "set-role",
        "set-password",
        "ban",
        "impersonate",
        "delete"
      ],
      vulnerability: ["read", "write", "delete"],
      import: ["write"],
      stats: ["read"]
    })

    expect(buildBetterAuthRoleConfig(builtRoles).roleStatements.admin).toEqual({
      asset: ["read", "write", "delete"],
      finding: ["read", "write", "delete"],
      import: ["write"],
      session: ["list", "revoke", "delete", "read", "write"],
      stats: ["read"],
      user: [
        "create",
        "list",
        "set-role",
        "ban",
        "impersonate",
        "delete",
        "set-password",
        "get",
        "update",
        "read",
        "write"
      ],
      vulnerability: ["read", "write", "delete"]
    })

    expect(
      buildBetterAuthRoleConfig(builtRoles).roles.admin.authorize({
        user: ["delete"]
      }).success
    ).toBe(true)
  })
})
