import type { MiddlewareHandler } from "hono"
import { auth } from "../lib/auth.js"
import { HTTPException } from "hono/http-exception"
import type {
  AuthApiPermissionClient,
  AuthApiSessionClient
} from "../lib/auth.js"
import type { AuthenticatedUser, ContextVariables } from "../lib/hono-schema.js"
import {
  domainPermission,
  userManagementPermissions,
  type DomainAction,
  type DomainResource
} from "../lib/permissions.js"

type PermissionPayload = Record<string, readonly string[]>

type PermissionChecker = AuthApiPermissionClient["userHasPermission"]

type AuthMiddleware = MiddlewareHandler<{ Variables: ContextVariables }>

function normalizePermissionResult(result: unknown): boolean {
  if (typeof result === "boolean") {
    return result
  }

  if (typeof result === "object" && result !== null) {
    const normalized = result as { success?: unknown }
    return normalized.success === true
  }

  return false
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
  permissions: PermissionPayload
): AuthMiddleware {
  return async function requirePermission(c, next) {
    const user = c.get("user")

    if (!user) {
      throw new HTTPException(401, { message: "Unauthorized" })
    }

    const result = await permissionChecker({
      body: {
        userId: user.id,
        permissions: permissions as Record<string, string[]>
      }
    })

    if (!normalizePermissionResult(result)) {
      throw new HTTPException(403, { message: "Forbidden" })
    }

    await next()
  }
}

export function requirePermission(
  permissions: PermissionPayload
): AuthMiddleware {
  return createRequirePermission(auth.api.userHasPermission, permissions)
}

export function requireDomainPermission<Resource extends DomainResource>(
  resource: Resource,
  action: DomainAction
): AuthMiddleware {
  return requirePermission(domainPermission(resource, action))
}

export function requireUserManagementRead(): AuthMiddleware {
  return requirePermission(userManagementPermissions.read)
}

export function requireUserManagementCreate(): AuthMiddleware {
  return requirePermission(userManagementPermissions.create)
}

export function requireUserManagementUpdate(): AuthMiddleware {
  return requirePermission(userManagementPermissions.update)
}
