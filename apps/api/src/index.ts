import { serve } from "@hono/node-server"
import { Hono } from "hono"
import { env } from "./env.js"

const app = new Hono().basePath("/api")

app.get("/", (c) => {
  return c.text("Hello Hono!")
})

serve(
  {
    fetch: app.fetch,
    port: env.PORT
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`)
  }
)
