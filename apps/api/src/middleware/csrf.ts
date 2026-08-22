import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { deleteCookie, getCookie, setCookie } from "hono/cookie";

import { forbidden, isApiError } from "../lib/api-error.js";
import { DEFAULT_AUTH_COOKIE_POLICY, cookieOptions, type AuthCookiePolicy } from "./auth.js";

import type { ContextVariables } from "../lib/hono-schema.js";
import type { UserSession } from "@exposurenexus/contracts/model/user";
import type { Context, MiddlewareHandler } from "hono";
import type { CookieOptions } from "hono/utils/cookie";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const VALID_FETCH_SITE_VALUES = new Set(["same-origin", "same-site", "cross-site", "none"]);
const TOKEN_SEPARATOR = ".";
const CSRF_HMAC_CONTEXT = "exposurenexus.csrf.v1";

export const CSRF_COOKIE = "__Host-exposurenexus-csrf";
export const CSRF_HEADER = "X-CSRF-Token";

type CsrfContext = Context<{ Variables: ContextVariables }>;
type CsrfMiddleware = MiddlewareHandler<{ Variables: ContextVariables }>;

export interface CsrfProtection {
  middleware: CsrfMiddleware;
  issueToken(c: CsrfContext, session: UserSession): void;
  clearToken(c: CsrfContext): void;
}

interface CsrfProtectionOptions {
  allowedOrigins: string[];
  tokenSecret: string;
  cookiePolicy?: AuthCookiePolicy;
}

function csrfCookieOptions(cookiePolicy: AuthCookiePolicy): CookieOptions {
  return {
    ...cookieOptions(cookiePolicy),
    httpOnly: false,
  };
}

function normalizeOrigin(origin: string): string {
  return new URL(origin).origin;
}

function createTokenSignature(sessionId: string, nonce: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(`${CSRF_HMAC_CONTEXT}:${sessionId}:${nonce}`)
    .digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function createToken(session: UserSession, secret: string): string {
  const nonce = randomBytes(32).toString("base64url");
  const signature = createTokenSignature(session.id, nonce, secret);

  return `${nonce}${TOKEN_SEPARATOR}${signature}`;
}

function verifyToken(token: string, session: UserSession, secret: string): boolean {
  const separatorIndex = token.indexOf(TOKEN_SEPARATOR);
  if (separatorIndex <= 0 || separatorIndex === token.length - 1) {
    return false;
  }

  const nonce = token.slice(0, separatorIndex);
  const signature = token.slice(separatorIndex + 1);
  const expectedSignature = createTokenSignature(session.id, nonce, secret);

  return safeEqual(signature, expectedSignature);
}

function isUnsafeMethod(method: string): boolean {
  return !SAFE_METHODS.has(method.toUpperCase());
}

function isLoginRequest(c: CsrfContext): boolean {
  return c.req.method.toUpperCase() === "POST" && c.req.path === "/api/auth";
}

function verifyFetchMetadata(c: CsrfContext): void {
  const fetchSite = c.req.header("sec-fetch-site");

  if (!fetchSite || !VALID_FETCH_SITE_VALUES.has(fetchSite)) {
    return;
  }

  if (fetchSite === "cross-site") {
    throw forbidden();
  }
}

function verifyOrigin(c: CsrfContext, allowedOrigins: ReadonlySet<string>) {
  const origin = c.req.header("origin");

  if (!origin) {
    throw forbidden();
  }

  try {
    if (!allowedOrigins.has(normalizeOrigin(origin))) {
      throw forbidden();
    }
  } catch (error) {
    if (isApiError(error)) {
      throw error;
    }
    throw forbidden();
  }
}

function verifyCsrfToken(c: CsrfContext, tokenSecret: string): void {
  const session = c.get("session");
  if (!session) {
    return;
  }

  const csrfCookie = getCookie(c, CSRF_COOKIE);
  const csrfHeader = c.req.header(CSRF_HEADER);

  if (
    !csrfCookie ||
    !csrfHeader ||
    !safeEqual(csrfHeader, csrfCookie) ||
    !verifyToken(csrfCookie, session, tokenSecret)
  ) {
    throw forbidden();
  }
}

export function createCsrfProtection({
  allowedOrigins,
  tokenSecret,
  cookiePolicy = DEFAULT_AUTH_COOKIE_POLICY,
}: CsrfProtectionOptions): CsrfProtection {
  const normalizedAllowedOrigins = new Set(allowedOrigins.map((origin) => normalizeOrigin(origin)));

  return {
    middleware: async (c, next) => {
      if (!isUnsafeMethod(c.req.method)) {
        await next();
        return;
      }

      verifyFetchMetadata(c);
      verifyOrigin(c, normalizedAllowedOrigins);

      if (!isLoginRequest(c)) {
        verifyCsrfToken(c, tokenSecret);
      }

      await next();
    },

    issueToken(c, session) {
      setCookie(c, CSRF_COOKIE, createToken(session, tokenSecret), {
        ...csrfCookieOptions(cookiePolicy),
        expires: session.expiresAt,
      });
    },

    clearToken(c) {
      deleteCookie(c, CSRF_COOKIE, csrfCookieOptions(cookiePolicy));
    },
  };
}
