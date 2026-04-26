import { Hono, type Context } from "hono"
import { deleteCookie, getCookie, setCookie } from "hono/cookie"
import { HTTPException } from "hono/http-exception"
import { zValidator } from "@hono/zod-validator"
import { getConnInfo } from "@hono/node-server/conninfo"
import { z } from "zod/v4"
import type { AuthSessionDataReply, AuthSessionReply } from "@openvlp/types/api"
import type { UserProfile, UserSession } from "@openvlp/types/model/user"
import { replyObject } from "../lib/reply.js"
import { AUTH_SESSION_COOKIE, cookieOptions } from "../middleware/auth.js"
import type { ContextVariables } from "../lib/hono-schema.js"

const loginSchema = z.strictObject({
  username: z.string().trim().min(1),
  password: z.string().min(1)
})
type LoginBody = z.infer<typeof loginSchema>

interface CreatedSession {
  sessionId: string
  session: UserSession
  user: UserProfile
}

interface ValidatedSession {
  session: UserSession
  user: UserProfile
}

interface AuthRouteService {
  createSessionForCredentials(input: {
    username: string
    password: string
    sourceIp: string
    userAgent?: string
  }): Promise<CreatedSession | null>
  validateSession(sessionId: string): Promise<ValidatedSession | null>
  revokeSession(sessionId: string): Promise<boolean>
}

function sessionReply(session: UserSession): AuthSessionReply {
  return {
    id: session.id,
    userId: session.userId,
    sourceIp: session.sourceIp,
    userAgent: session.userAgent,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt
  }
}

function getRequestSourceIp(
  c: Context<{ Variables: ContextVariables }>
): string {
  const forwardedFor = c.req.header("x-forwarded-for")
  if (forwardedFor) {
    const firstForwardedIp = forwardedFor.split(",", 1)[0]?.trim()
    if (firstForwardedIp) {
      return firstForwardedIp
    }
  }

  const realIp = c.req.header("x-real-ip")?.trim()
  if (realIp) {
    return realIp
  }

  try {
    return getConnInfo(c).remote.address ?? "unknown"
  } catch {
    return "unknown"
  }
}

export function createAuthRoute(authService: AuthRouteService) {
  const auth = new Hono<{ Variables: ContextVariables }>()

  async function createLoginResponse(
    c: Context<{ Variables: ContextVariables }>,
    body: LoginBody
  ) {
    const createdSession = await authService.createSessionForCredentials({
      username: body.username,
      password: body.password,
      sourceIp: getRequestSourceIp(c),
      userAgent: c.req.header("user-agent") ?? undefined
    })

    if (!createdSession) {
      throw new HTTPException(401, { message: "Unauthorized" })
    }

    setCookie(c, AUTH_SESSION_COOKIE, createdSession.sessionId, {
      ...cookieOptions(c),
      expires: createdSession.session.expiresAt
    })

    const reply: AuthSessionDataReply = {
      user: createdSession.user,
      session: sessionReply(createdSession.session)
    }

    return replyObject(c, reply)
  }

  auth.post("/", zValidator("json", loginSchema), async (c) => {
    return createLoginResponse(c, c.req.valid("json"))
  })

  auth.get("/session", async (c) => {
    const sessionId = getCookie(c, AUTH_SESSION_COOKIE)
    if (!sessionId) {
      throw new HTTPException(401, { message: "Unauthorized" })
    }

    const validatedSession = await authService.validateSession(sessionId)
    if (!validatedSession) {
      deleteCookie(c, AUTH_SESSION_COOKIE, cookieOptions(c))
      throw new HTTPException(401, { message: "Unauthorized" })
    }

    const reply: AuthSessionDataReply = {
      user: validatedSession.user,
      session: sessionReply(validatedSession.session)
    }

    return replyObject(c, reply)
  })

  auth.delete("/", async (c) => {
    const sessionId = getCookie(c, AUTH_SESSION_COOKIE)
    const revoked = sessionId
      ? await authService.revokeSession(sessionId)
      : false

    deleteCookie(c, AUTH_SESSION_COOKIE, cookieOptions(c))

    return replyObject(c, { revoked })
  })

  return auth
}
