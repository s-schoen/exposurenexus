import { Hono } from "hono"
import { badRequest, replyObject } from "../lib/reply.js"
import { createLogger } from "../logging.js"
import { parseFindingsFromFile } from "../import/importer.js"
import type { User } from "better-auth"
import type { ContextVariables } from "../lib/hono-schema.js"

const logger = createLogger("findings/import")
const importer = new Hono<{ Variables: ContextVariables }>()

importer.post("/import", async (c) => {
  const body = await c.req.parseBody()

  if (!body["file"] || typeof body["type"] !== "string") {
    badRequest("expected type in form data")
  }
  const type = body["type"] as string

  if (!body["file"] || typeof body["file"] === "string") {
    badRequest("expected file in form data")
  }
  const file = body["file"] as File

  logger.info(
    `file uploaded: name=${file.name} size=${file.size} filetype=${file.type} type=${type}`
  )

  const buffer = Buffer.from(await file.arrayBuffer())

  // save to database
  const user: User = c.get("user")

  //  parse findings
  const findings = await parseFindingsFromFile({ user }, type, buffer)
  logger.info(`created ${findings.length} findings`)

  return replyObject(c, { status: "ok" })
})

export default importer
