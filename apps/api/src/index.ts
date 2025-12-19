import { serve } from "@hono/node-server"
import { Hono } from "hono"
import { env } from "./env.js"
import { createLogger } from "./logging.js"

const logger = createLogger("main")

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
    logger.info(`server is running on localhost:${info.port}`)
  }
)
