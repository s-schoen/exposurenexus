import { Hono } from "hono"
import { badRequest, replyObject } from "../lib/reply.js"
import { createLogger } from "../logging.js"
import { parseFindingsFromFile } from "../import/importer.js"
import { db } from "../db/index.js"
import { createFinding } from "../lib/finding.js"
import { auth } from "../lib/auth.js"

const logger = createLogger("findings/import")
const importer = new Hono()

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

  //  parse findings
  const findings = await parseFindingsFromFile(type, buffer)

  // save to database
  // FIXME: register context types correctly
  const user: typeof auth.$Infer.Session.session = c.get("user")
  const now = new Date()

  // TODO: calculate fingerprint
  await db.transaction().execute(async (trx) => {
    for (const finding of findings) {
      await createFinding({
        createdAt: now,
        updatedAt: now,
        lastSeen: now,
        firstSeen: now,
        updatedBy: user.id,
        createdBy: user.id,
        fingerprint: "",
        ...finding
      })
    }
  })

  logger.info(`created ${findings.length} findings`)

  return replyObject(c, { status: "ok" })
})

export default importer
