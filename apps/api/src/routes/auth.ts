import {
  authLoginSchema,
  authSessionDataReplySchema,
  authSessionReplySchema,
  authSignOutDataReplySchema,
  type AuthLogin,
  type AuthSessionReply,
} from "@exposurenexus/contracts/api";
import { getConnInfo } from "@hono/node-server/conninfo";
import { zValidator } from "@hono/zod-validator";
import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";

import { unauthorized } from "../lib/api-error.js";
import { replyObject } from "../lib/reply.js";
import { resolveRequestSourceIp } from "../lib/source-ip.js";
import {
  AUTH_SESSION_COOKIE,
  DEFAULT_AUTH_COOKIE_POLICY,
  cookieOptions,
  type AuthCookiePolicy,
} from "../middleware/auth.js";

import type { ContextVariables } from "../lib/hono-schema.js";
import type { CsrfProtection } from "../middleware/csrf.js";
import type { AuthService } from "../service/auth.js";
import type { UserSession } from "@exposurenexus/contracts/model/user";

interface AuthRouteOptions {
  csrf?: Pick<CsrfProtection, "issueToken" | "clearToken">;
  cookiePolicy?: AuthCookiePolicy;
  trustedProxies?: readonly string[];
}

function sessionReply(session: UserSession): AuthSessionReply {
  return authSessionReplySchema.parse({
    id: session.id,
    userId: session.userId,
    sourceIp: session.sourceIp,
    userAgent: session.userAgent,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
  });
}

function getRequestSourceIp(
  c: Context<{ Variables: ContextVariables }>,
  trustedProxies: readonly string[],
): string {
  let remoteAddress: string | null;
  try {
    remoteAddress = getConnInfo(c).remote.address ?? null;
  } catch {
    remoteAddress = null;
  }

  return resolveRequestSourceIp({
    remoteAddress,
    forwardedFor: c.req.header("x-forwarded-for"),
    realIp: c.req.header("x-real-ip"),
    trustedProxies,
  });
}

function requestCorrelation(c: Context<{ Variables: ContextVariables }>): {
  correlationId?: string;
} {
  const requestId = c.get("requestId") as string | undefined;

  return requestId !== undefined ? { correlationId: requestId } : {};
}

export function createAuthRoute(authService: AuthService, options: AuthRouteOptions = {}) {
  const auth = new Hono<{ Variables: ContextVariables }>();
  const cookiePolicy = options.cookiePolicy ?? DEFAULT_AUTH_COOKIE_POLICY;
  const trustedProxies = options.trustedProxies ?? [];

  async function createLoginResponse(c: Context<{ Variables: ContextVariables }>, body: AuthLogin) {
    const createdSession = await authService.createSessionForCredentials({
      username: body.username,
      password: body.password,
      sourceIp: getRequestSourceIp(c, trustedProxies),
      userAgent: c.req.header("user-agent") ?? undefined,
      ...requestCorrelation(c),
    });

    if (!createdSession) {
      throw unauthorized();
    }

    setCookie(c, AUTH_SESSION_COOKIE, createdSession.sessionId, {
      ...cookieOptions(cookiePolicy),
      expires: createdSession.session.expiresAt,
    });
    options.csrf?.issueToken(c, createdSession.session);

    const reply = authSessionDataReplySchema.parse({
      user: createdSession.user,
      session: sessionReply(createdSession.session),
    });

    return replyObject(c, reply);
  }

  auth.post("/", zValidator("json", authLoginSchema), async (c) => {
    return createLoginResponse(c, c.req.valid("json"));
  });

  auth.get("/session", async (c) => {
    const sessionId = getCookie(c, AUTH_SESSION_COOKIE);
    if (!sessionId) {
      throw unauthorized();
    }

    const validatedSession = await authService.validateSession({
      sessionId,
      ...requestCorrelation(c),
    });
    if (!validatedSession) {
      deleteCookie(c, AUTH_SESSION_COOKIE, cookieOptions(cookiePolicy));
      options.csrf?.clearToken(c);
      throw unauthorized();
    }

    const reply = authSessionDataReplySchema.parse({
      user: validatedSession.user,
      session: sessionReply(validatedSession.session),
    });

    return replyObject(c, reply);
  });

  auth.delete("/", async (c) => {
    const sessionId = getCookie(c, AUTH_SESSION_COOKIE);
    const revoked = sessionId
      ? await authService.revokeSession({
          sessionId,
          ...requestCorrelation(c),
        })
      : false;

    deleteCookie(c, AUTH_SESSION_COOKIE, cookieOptions(cookiePolicy));
    options.csrf?.clearToken(c);

    return replyObject(c, authSignOutDataReplySchema.parse({ revoked }));
  });

  return auth;
}
