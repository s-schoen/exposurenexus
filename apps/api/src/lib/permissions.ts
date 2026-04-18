import { adminAc, defaultStatements } from "better-auth/plugins/admin/access"
import { createAccessControl } from "better-auth/plugins/access"

export const domainResources = [
  "asset",
  "finding",
  "vulnerability",
  "import",
  "stats"
] as const

export const domainActions = ["read", "write", "delete"] as const

export const domainStatements = {
  asset: ["read", "write", "delete"],
  finding: ["read", "write", "delete"],
  vulnerability: ["read", "write", "delete"],
  import: ["write"],
  stats: ["read"]
} as const

export const statements = {
  ...defaultStatements,
  ...domainStatements
} as const

export const ac = createAccessControl(statements)

export const roleStatements = {
  viewer: {
    asset: ["read"],
    finding: ["read"],
    vulnerability: ["read"],
    stats: ["read"]
  },
  editor: {
    asset: ["read", "write", "delete"],
    finding: ["read", "write", "delete"],
    vulnerability: ["read", "write", "delete"],
    import: ["write"],
    stats: ["read"]
  },
  admin: {
    ...adminAc.statements,
    asset: ["read", "write", "delete"],
    finding: ["read", "write", "delete"],
    vulnerability: ["read", "write", "delete"],
    import: ["write"],
    stats: ["read"]
  }
} as const

export const roles = {
  viewer: ac.newRole(roleStatements.viewer),
  editor: ac.newRole(roleStatements.editor),
  admin: ac.newRole(roleStatements.admin)
} as const

export type DomainResource = keyof typeof domainStatements

export function domainPermission<Resource extends DomainResource>(
  resource: Resource,
  action: (typeof domainStatements)[Resource][number]
) {
  return { [resource]: [action] } as Record<
    Resource,
    Array<(typeof domainStatements)[Resource][number]>
  >
}

export const userManagementPermissions = {
  read: { user: ["list"] },
  create: { user: ["create"] },
  update: { user: ["list"] }
} as const
