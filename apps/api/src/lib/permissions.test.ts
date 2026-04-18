import { describe, expect, it } from "vitest"
import {
  adminRole,
  editorRole,
  PermissionResource,
  PermissionVerb,
  viewerRole
} from "@openvlp/types/model/rbac"
import { adminAc } from "better-auth/plugins/admin/access"
import {
  domainActions,
  domainPermission,
  domainResources,
  roleStatements,
  toPermissionStatement,
  toPermissionStatements,
  toRoleStatement,
  userManagementPermissions
} from "./permissions.js"

describe("rbac permissions", () => {
  it("derives domain resources and actions from the shared enums", () => {
    expect(domainResources).toEqual([
      PermissionResource.Asset,
      PermissionResource.Finding,
      PermissionResource.Vulnerability,
      PermissionResource.Import,
      PermissionResource.Stats
    ])
    expect([...domainResources].sort()).toEqual([...Object.values(PermissionResource)].sort())

    expect(domainActions).toEqual([
      PermissionVerb.Read,
      PermissionVerb.Write,
      PermissionVerb.Delete
    ])
    expect([...domainActions].sort()).toEqual([...Object.values(PermissionVerb)].sort())
  })

  it("builds domain permission payloads for route middleware", () => {
    expect(domainPermission(PermissionResource.Asset, PermissionVerb.Read)).toEqual({
      asset: ["read"]
    })
    expect(
      domainPermission(PermissionResource.Finding, PermissionVerb.Delete)
    ).toEqual({
      finding: ["delete"]
    })
    expect(domainPermission(PermissionResource.Stats, PermissionVerb.Delete)).toEqual({
      stats: ["delete"]
    })
  })

  it("adapts single and multiple shared permissions into Better Auth statements", () => {
    expect(
      toPermissionStatement({
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
  })

  it("derives viewer, editor, and admin role grants from the shared built-in roles", () => {
    expect(toRoleStatement(viewerRole)).toEqual({
      asset: ["read"],
      finding: ["read"],
      vulnerability: ["read"],
      stats: ["read"]
    })

    expect(roleStatements.viewer).toEqual(toRoleStatement(viewerRole))

    expect(toRoleStatement(editorRole)).toEqual({
      asset: ["read", "write", "delete"],
      finding: ["read", "write", "delete"],
      vulnerability: ["read", "write", "delete"],
      import: ["write"],
      stats: ["read"]
    })

    expect(roleStatements.editor).toEqual(toRoleStatement(editorRole))

    expect(roleStatements.admin).toEqual({
      ...adminAc.statements,
      ...toRoleStatement(adminRole)
    })
  })

  it("centralizes Better Auth user-route permission mappings", () => {
    expect(userManagementPermissions.read).toEqual({ user: ["list"] })
    expect(userManagementPermissions.create).toEqual({ user: ["create"] })
    expect(userManagementPermissions.update).toEqual({ user: ["update"] })
  })
})
