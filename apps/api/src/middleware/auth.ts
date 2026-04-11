import type { MiddlewareHandler } from "hono"
import { auth } from "../lib/auth.js"
import { HTTPException } from "hono/http-exception"
import type { AuthApiSessionClient } from "../lib/auth.js"

export function createAuthAnnotate(
  authApi: AuthApiSessionClient
): MiddlewareHandler {
  return async function authNAnnotate(c, next) {
    const session = await authApi.getSession({ headers: c.req.raw.headers })

    if (!session) {
      c.set("user", null)
      c.set("session", null)
      await next()
      return
    }

    c.set("user", session.user)
    c.set("session", session.session)
    await next()
  }
}

export const authNAnnotate = (): MiddlewareHandler => {
  return createAuthAnnotate(auth.api)
}

export const authNRequire = (): MiddlewareHandler => {
  return async function authNRequire(c, next) {
    const user = c.get("user")
    if (!user) {
      throw new HTTPException(401, { message: "Unauthorized" })
    }
    await next()
  }
}
