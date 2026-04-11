import { Hono } from "hono"
import type { AuthClient } from "../lib/auth.js"

export function createAuthRoute(authClient: Pick<AuthClient, "handler">) {
  const auth = new Hono()

  auth.on(["POST", "GET"], "/*", (c) => {
    return authClient.handler(c.req.raw)
  })

  return auth
}
