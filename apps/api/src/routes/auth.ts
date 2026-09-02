import { getConnInfo } from "@hono/node-server/conninfo";
import { zValidator } from "@hono/zod-validator";
import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { z } from "zod/v4";

import { unauthorized } from "../lib/api-error.js";
import { replyObject } from "../lib/reply.js";
import { resolveRequestSourceIp } from "../lib/source-ip.js";
import {
  AUTH_SESSION_COOKIE,
  DEFAULT_AUTH_COOKIE_POLICY,
  cookieOptions,
  type AuthCookiePolicy,
} from "../middleware/auth.js";

import type { ApiAuthentication } from "../lib/authentication-events.js";
import type { ContextVariables } from "../lib/hono-schema.js";
import type { CsrfProtection } from "../middleware/csrf.js";
import type { AuthenticationSession } from "@exposurenexus/backend/authentication";
import type { AuthSessionDataReply, AuthSessionReply } from "@exposurenexus/contracts/api";

const loginSchema = z.strictObject({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});
type LoginBody = z.infer<typeof loginSchema>;

interface AuthRouteOptions {
  csrf?: Pick<CsrfProtection, "issueToken" | "clearToken">;
  cookiePolicy?: AuthCookiePolicy;
  trustedProxies?: readonly string[];
}

function sessionReply(session: AuthenticationSession): AuthSessionReply {
  return {
    id: session.id,
    userId: session.userId,
    sourceIp: session.sourceIp,
    userAgent: session.userAgent,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
  };
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

export function createAuthRoute(authentication: ApiAuthentication, options: AuthRouteOptions = {}) {
  const auth = new Hono<{ Variables: ContextVariables }>();
  const cookiePolicy = options.cookiePolicy ?? DEFAULT_AUTH_COOKIE_POLICY;
  const trustedProxies = options.trustedProxies ?? [];

  async function createLoginResponse(c: Context<{ Variables: ContextVariables }>, body: LoginBody) {
    const createdSession = await authentication.createSessionForCredentials({
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

    const reply: AuthSessionDataReply = {
      user: createdSession.user,
      session: sessionReply(createdSession.session),
    };

    return replyObject(c, reply);
  }

  auth.post("/", zValidator("json", loginSchema), async (c) => {
    return createLoginResponse(c, c.req.valid("json"));
  });

  auth.get("/session", async (c) => {
    const sessionId = getCookie(c, AUTH_SESSION_COOKIE);
    if (!sessionId) {
      throw unauthorized();
    }

    const validatedSession = await authentication.validateSession({
      sessionId,
      ...requestCorrelation(c),
    });
    if (!validatedSession) {
      deleteCookie(c, AUTH_SESSION_COOKIE, cookieOptions(cookiePolicy));
      options.csrf?.clearToken(c);
      throw unauthorized();
    }

    const reply: AuthSessionDataReply = {
      user: validatedSession.user,
      session: sessionReply(validatedSession.session),
    };

    return replyObject(c, reply);
  });

  auth.delete("/", async (c) => {
    const sessionId = getCookie(c, AUTH_SESSION_COOKIE);
    const revoked = sessionId
      ? await authentication.revokeSession({
          sessionId,
          ...requestCorrelation(c),
        })
      : false;

    deleteCookie(c, AUTH_SESSION_COOKIE, cookieOptions(cookiePolicy));
    options.csrf?.clearToken(c);

    return replyObject(c, { revoked });
  });

  return auth;
}
