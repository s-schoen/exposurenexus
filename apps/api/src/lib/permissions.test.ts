import { describe, expect, it } from "vitest"
import {
  domainActions,
  domainPermission,
  domainResources,
  roleStatements,
  userManagementPermissions
} from "./permissions.js"

describe("rbac permissions", () => {
  it("defines the expected domain resources and actions", () => {
    expect(domainResources).toEqual([
      "asset",
      "finding",
      "vulnerability",
      "import",
      "stats"
    ])
    expect(domainActions).toEqual(["read", "write", "delete"])
  })

  it("builds domain permission payloads for route middleware", () => {
    expect(domainPermission("asset", "read")).toEqual({
      asset: ["read"]
    })
    expect(domainPermission("finding", "delete")).toEqual({
      finding: ["delete"]
    })
    expect(domainPermission("stats", "delete")).toEqual({
      stats: ["delete"]
    })
  })

  it("keeps viewer, editor, and admin role grants explicit", () => {
    expect(roleStatements.viewer).toEqual({
      asset: ["read"],
      finding: ["read"],
      vulnerability: ["read"],
      stats: ["read"]
    })

    expect(roleStatements.editor).toEqual({
      asset: ["read", "write", "delete"],
      finding: ["read", "write", "delete"],
      vulnerability: ["read", "write", "delete"],
      import: ["write"],
      stats: ["read"]
    })

    expect(roleStatements.admin.asset).toEqual(["read", "write", "delete"])
    expect(roleStatements.admin.finding).toEqual(["read", "write", "delete"])
    expect(roleStatements.admin.vulnerability).toEqual([
      "read",
      "write",
      "delete"
    ])
  })

  it("centralizes Better Auth user-route permission mappings", () => {
    expect(userManagementPermissions.read).toEqual({ user: ["list"] })
    expect(userManagementPermissions.create).toEqual({ user: ["create"] })
    expect(userManagementPermissions.update).toEqual({ user: ["list"] })
  })
})
