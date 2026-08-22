import { deleteCookie, getCookie } from "hono/cookie";

import { forbidden, unauthorized } from "../lib/api-error.js";
import {
  domainPermission,
  type ResourcePermissionVerbAssignment,
  toPermissionStatements,
} from "../lib/permissions.js";

import type { ContextVariables } from "../lib/hono-schema.js";
import type {
  Permission,
  PermissionResource,
  PermissionVerb,
} from "@exposurenexus/contracts/model/rbac";
import type { UserProfile } from "@exposurenexus/contracts/model/user";
import type { MiddlewareHandler } from "hono";
import type { CookieOptions } from "hono/utils/cookie";

type DomainPermissionResource = PermissionResource | `${PermissionResource}`;
type DomainPermissionAction = PermissionVerb | `${PermissionVerb}`;

type PermissionChecker = (
  userId: string,
  permissions: ResourcePermissionVerbAssignment,
) => Promise<boolean>;

interface ValidatedSession {
  user: UserProfile;
  session: ContextVariables["session"];
}

interface SessionValidator {
  validateSession(input: {
    sessionId: string;
    correlationId?: string;
  }): Promise<ValidatedSession | null>;
}

export interface AuthCookiePolicy {
  secure: true;
}

export const AUTH_SESSION_COOKIE = "__Host-exposurenexus-session";
export const DEFAULT_AUTH_COOKIE_POLICY: AuthCookiePolicy = Object.freeze({
  secure: true,
});

export type AuthMiddleware = MiddlewareHandler<{ Variables: ContextVariables }>;
export type RequireDomainPermission = <Resource extends DomainPermissionResource>(
  resource: Resource,
  action: DomainPermissionAction,
) => AuthMiddleware;

export function createAuthCookiePolicy(options: { secure: boolean }): AuthCookiePolicy {
  if (!options.secure) {
    throw new Error("__Host auth cookies require AUTH_COOKIE_SECURE=true");
  }

  return DEFAULT_AUTH_COOKIE_POLICY;
}

export function cookieOptions(
  policy: AuthCookiePolicy = DEFAULT_AUTH_COOKIE_POLICY,
  httpOnly = true,
): CookieOptions {
  return {
    httpOnly,
    sameSite: "Lax",
    secure: policy.secure,
    path: "/",
  };
}

function normalizePermissions(permissions: Permission | Permission[]): readonly Permission[] {
  if (Array.isArray(permissions)) {
    return permissions;
  }
  return [permissions];
}

export function createAuthAnnotate(
  authService: SessionValidator,
  cookiePolicy: AuthCookiePolicy = DEFAULT_AUTH_COOKIE_POLICY,
): AuthMiddleware {
  return async function authNAnnotate(c, next) {
    const sessionId = getCookie(c, AUTH_SESSION_COOKIE);

    if (!sessionId) {
      c.set("user", null);
      c.set("session", null);
      await next();
      return;
    }

    const requestId = c.get("requestId") as string | undefined;
    const validatedSession = await authService.validateSession({
      sessionId,
      ...(requestId !== undefined ? { correlationId: requestId } : {}),
    });

    if (!validatedSession) {
      deleteCookie(c, AUTH_SESSION_COOKIE, cookieOptions(cookiePolicy));
      c.set("user", null);
      c.set("session", null);
      await next();
      return;
    }

    c.set("user", validatedSession.user);
    c.set("session", validatedSession.session);
    await next();
  };
}

export const authNRequire = (): AuthMiddleware => {
  return async function authNRequire(c, next) {
    const user = c.get("user");
    if (!user) {
      throw unauthorized();
    }
    await next();
  };
};

export function createRequirePermission(
  permissionChecker: PermissionChecker,
  permissions: Permission | Permission[],
): AuthMiddleware {
  return async function requirePermission(c, next) {
    const user = c.get("user");

    if (!user) {
      throw unauthorized();
    }

    const result = await permissionChecker(
      user.id,
      toPermissionStatements(normalizePermissions(permissions)),
    );

    if (!result) {
      throw forbidden();
    }

    await next();
  };
}

export function createRequireDomainPermission(
  permissionChecker: PermissionChecker,
): RequireDomainPermission {
  return function requireDomainPermission<Resource extends DomainPermissionResource>(
    resource: Resource,
    action: DomainPermissionAction,
  ): AuthMiddleware {
    return createRequirePermission(
      permissionChecker,
      domainPermission(resource as PermissionResource, action as PermissionVerb),
    );
  };
}
