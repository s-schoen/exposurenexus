import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"
import type { Context, MiddlewareHandler } from "hono"
import { deleteCookie, getCookie, setCookie } from "hono/cookie"
import type { CookieOptions } from "hono/utils/cookie"
import { HTTPException } from "hono/http-exception"
import type { UserSession } from "@openvlp/types/model/user"
import type { ContextVariables } from "../lib/hono-schema.js"
import { cookieOptions } from "./auth.js"

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"])
const VALID_FETCH_SITE_VALUES = new Set([
  "same-origin",
  "same-site",
  "cross-site",
  "none"
])
const TOKEN_SEPARATOR = "."
const CSRF_HMAC_CONTEXT = "openvlp.csrf.v1"

export const CSRF_COOKIE = "csrf_token"
export const CSRF_HEADER = "X-CSRF-Token"

type CsrfContext = Context<{ Variables: ContextVariables }>
type CsrfMiddleware = MiddlewareHandler<{ Variables: ContextVariables }>

export interface CsrfProtection {
  middleware: CsrfMiddleware
  issueToken(c: CsrfContext, session: UserSession): void
  clearToken(c: CsrfContext): void
}

interface CsrfProtectionOptions {
  allowedOrigins: string[]
  tokenSecret: string
}

function csrfCookieOptions(c: Context): CookieOptions {
  return {
    ...cookieOptions(c),
    httpOnly: false
  }
}

function normalizeOrigin(origin: string): string {
  return new URL(origin).origin
}

function createTokenSignature(
  sessionId: string,
  nonce: string,
  secret: string
): string {
  return createHmac("sha256", secret)
    .update(`${CSRF_HMAC_CONTEXT}:${sessionId}:${nonce}`)
    .digest("base64url")
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  )
}

function createToken(session: UserSession, secret: string): string {
  const nonce = randomBytes(32).toString("base64url")
  const signature = createTokenSignature(session.id, nonce, secret)

  return `${nonce}${TOKEN_SEPARATOR}${signature}`
}

function verifyToken(
  token: string,
  session: UserSession,
  secret: string
): boolean {
  const separatorIndex = token.indexOf(TOKEN_SEPARATOR)
  if (separatorIndex <= 0 || separatorIndex === token.length - 1) {
    return false
  }

  const nonce = token.slice(0, separatorIndex)
  const signature = token.slice(separatorIndex + 1)
  const expectedSignature = createTokenSignature(session.id, nonce, secret)

  return safeEqual(signature, expectedSignature)
}

function isUnsafeMethod(method: string): boolean {
  return !SAFE_METHODS.has(method.toUpperCase())
}

function isLoginRequest(c: CsrfContext): boolean {
  return c.req.method.toUpperCase() === "POST" && c.req.path === "/api/auth"
}

function verifyFetchMetadata(c: CsrfContext): void {
  const fetchSite = c.req.header("sec-fetch-site")

  if (!fetchSite || !VALID_FETCH_SITE_VALUES.has(fetchSite)) {
    return
  }

  if (fetchSite === "cross-site") {
    throw new HTTPException(403, { message: "Forbidden" })
  }
}

function verifyOrigin(c: CsrfContext, allowedOrigins: ReadonlySet<string>) {
  const origin = c.req.header("origin")

  if (!origin) {
    throw new HTTPException(403, { message: "Forbidden" })
  }

  try {
    if (!allowedOrigins.has(normalizeOrigin(origin))) {
      throw new HTTPException(403, { message: "Forbidden" })
    }
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error
    }
    throw new HTTPException(403, { message: "Forbidden" })
  }
}

function verifyCsrfToken(c: CsrfContext, tokenSecret: string): void {
  const session = c.get("session")
  if (!session) {
    return
  }

  const csrfCookie = getCookie(c, CSRF_COOKIE)
  const csrfHeader = c.req.header(CSRF_HEADER)

  if (
    !csrfCookie ||
    !csrfHeader ||
    !safeEqual(csrfHeader, csrfCookie) ||
    !verifyToken(csrfCookie, session, tokenSecret)
  ) {
    throw new HTTPException(403, { message: "Forbidden" })
  }
}

export function createCsrfProtection({
  allowedOrigins,
  tokenSecret
}: CsrfProtectionOptions): CsrfProtection {
  const normalizedAllowedOrigins = new Set(
    allowedOrigins.map((origin) => normalizeOrigin(origin))
  )

  return {
    middleware: async (c, next) => {
      if (!isUnsafeMethod(c.req.method)) {
        await next()
        return
      }

      verifyFetchMetadata(c)
      verifyOrigin(c, normalizedAllowedOrigins)

      if (!isLoginRequest(c)) {
        verifyCsrfToken(c, tokenSecret)
      }

      await next()
    },

    issueToken(c, session) {
      setCookie(c, CSRF_COOKIE, createToken(session, tokenSecret), {
        ...csrfCookieOptions(c),
        expires: session.expiresAt
      })
    },

    clearToken(c) {
      deleteCookie(c, CSRF_COOKIE, csrfCookieOptions(c))
    }
  }
}
