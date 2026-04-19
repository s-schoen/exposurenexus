import type { MiddlewareHandler } from "hono"
import type {
  Permission,
  PermissionResource,
  PermissionVerb
} from "@openvlp/types/model/rbac"
import { auth } from "../lib/auth.js"
import { HTTPException } from "hono/http-exception"
import type {
  AuthApiPermissionClient,
  AuthApiSessionClient
} from "../lib/auth.js"
import type { AuthenticatedUser, ContextVariables } from "../lib/hono-schema.js"
import { domainPermission, toPermissionStatements } from "../lib/permissions.js"

type DomainPermissionResource = PermissionResource | `${PermissionResource}`
type DomainPermissionAction = PermissionVerb | `${PermissionVerb}`

type PermissionChecker = AuthApiPermissionClient["userHasPermission"]

type AuthMiddleware = MiddlewareHandler<{ Variables: ContextVariables }>

function normalizePermissions(
  permissions: Permission | Permission[]
): readonly Permission[] {
  if (Array.isArray(permissions)) {
    return permissions
  }
  return [permissions]
}

export function createAuthAnnotate(
  authApi: AuthApiSessionClient
): AuthMiddleware {
  return async function authNAnnotate(c, next) {
    const session = await authApi.getSession({ headers: c.req.raw.headers })

    if (!session) {
      c.set("user", null)
      c.set("session", null)
      await next()
      return
    }

    c.set("user", session.user as AuthenticatedUser)
    c.set("session", session.session)
    await next()
  }
}

export const authNAnnotate = (): AuthMiddleware => {
  return createAuthAnnotate(auth.api)
}

export const authNRequire = (): AuthMiddleware => {
  return async function authNRequire(c, next) {
    const user = c.get("user")
    if (!user) {
      throw new HTTPException(401, { message: "Unauthorized" })
    }
    await next()
  }
}

export function createRequirePermission(
  permissionChecker: PermissionChecker,
  permissions: Permission | Permission[]
): AuthMiddleware {
  return async function requirePermission(c, next) {
    const user = c.get("user")

    if (!user) {
      throw new HTTPException(401, { message: "Unauthorized" })
    }

    const result = await permissionChecker({
      body: {
        userId: user.id,
        permissions: toPermissionStatements(normalizePermissions(permissions))
      }
    })

    if (!result) {
      throw new HTTPException(403, { message: "Forbidden" })
    }

    await next()
  }
}

export function requirePermission(
  permissions: Permission | Permission[]
): AuthMiddleware {
  return createRequirePermission(auth.api.userHasPermission, permissions)
}

export function requireDomainPermission<
  Resource extends DomainPermissionResource
>(resource: Resource, action: DomainPermissionAction): AuthMiddleware {
  return requirePermission(
    domainPermission(resource as PermissionResource, action as PermissionVerb)
  )
}
