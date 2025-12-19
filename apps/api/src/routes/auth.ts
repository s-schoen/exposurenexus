import { Hono } from "hono"
import { auth as betterAuth } from "../lib/auth.js"

const auth = new Hono()

auth.on(["POST", "GET"], "/*", (c) => {
  return betterAuth.handler(c.req.raw)
})

export default auth
