import type { MiddlewareHandler } from "hono"
import type { Context } from "hono"
import { deleteCookie, getCookie } from "hono/cookie"
import type { CookieOptions } from "hono/utils/cookie"
import type {
  Permission,
  PermissionResource,
  PermissionVerb
} from "@openvlp/types/model/rbac"
import type { UserProfile } from "@openvlp/types/model/user"
import { HTTPException } from "hono/http-exception"
import type { ContextVariables } from "../lib/hono-schema.js"
import {
  domainPermission,
  type ResourcePermissionVerbAssignment,
  toPermissionStatements
} from "../lib/permissions.js"

type DomainPermissionResource = PermissionResource | `${PermissionResource}`
type DomainPermissionAction = PermissionVerb | `${PermissionVerb}`

type PermissionChecker = (
  userId: string,
  permissions: ResourcePermissionVerbAssignment
) => Promise<boolean>

interface ValidatedSession {
  user: UserProfile
  session: ContextVariables["session"]
}

interface SessionValidator {
  validateSession(sessionId: string): Promise<ValidatedSession | null>
}

export const AUTH_SESSION_COOKIE = "session"

export type AuthMiddleware = MiddlewareHandler<{ Variables: ContextVariables }>
export type RequireDomainPermission = <
  Resource extends DomainPermissionResource
>(
  resource: Resource,
  action: DomainPermissionAction
) => AuthMiddleware

export function cookieOptions(c: Context): CookieOptions {
  const forwardedProto = c.req.header("x-forwarded-proto")
  const secure =
    forwardedProto === "https" || new URL(c.req.url).protocol === "https:"

  return {
    httpOnly: true,
    sameSite: "Lax",
    secure,
    path: "/"
  }
}

function normalizePermissions(
  permissions: Permission | Permission[]
): readonly Permission[] {
  if (Array.isArray(permissions)) {
    return permissions
  }
  return [permissions]
}

export function createAuthAnnotate(
  authService: SessionValidator
): AuthMiddleware {
  return async function authNAnnotate(c, next) {
    const sessionId = getCookie(c, AUTH_SESSION_COOKIE)

    if (!sessionId) {
      c.set("user", null)
      c.set("session", null)
      await next()
      return
    }

    const validatedSession = await authService.validateSession(sessionId)

    if (!validatedSession) {
      deleteCookie(c, AUTH_SESSION_COOKIE, cookieOptions(c))
      c.set("user", null)
      c.set("session", null)
      await next()
      return
    }

    c.set("user", validatedSession.user)
    c.set("session", validatedSession.session)
    await next()
  }
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

    const result = await permissionChecker(
      user.id,
      toPermissionStatements(normalizePermissions(permissions))
    )

    if (!result) {
      throw new HTTPException(403, { message: "Forbidden" })
    }

    await next()
  }
}

export function createRequireDomainPermission(
  permissionChecker: PermissionChecker
): RequireDomainPermission {
  return function requireDomainPermission<
    Resource extends DomainPermissionResource
  >(resource: Resource, action: DomainPermissionAction): AuthMiddleware {
    return createRequirePermission(
      permissionChecker,
      domainPermission(resource as PermissionResource, action as PermissionVerb)
    )
  }
}
