import { Hono } from "hono"
import { badRequest, replyObject } from "../lib/reply.js"
import type { User } from "better-auth"
import type { ContextVariables } from "../lib/hono-schema.js"
import type { Logger } from "pino"
import type { ImportContext } from "../import/importer.js"

interface FindingImportService {
  parseFindingsFromFile(
    ctx: ImportContext,
    type: string,
    file: Buffer
  ): Promise<Array<unknown>>
}

interface ImportRouteDependencies {
  importer: FindingImportService
  logger: Logger
}

export function createImportRoute({
  importer,
  logger
}: ImportRouteDependencies) {
  const importRoute = new Hono<{ Variables: ContextVariables }>()

  importRoute.post("/import", async (c) => {
    const body = await c.req.parseBody()

    if (typeof body["type"] !== "string") {
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
    const user: User = c.get("user")
    const findings = await importer.parseFindingsFromFile(
      { user },
      type,
      buffer
    )
    logger.info(`created ${findings.length} findings`)

    return replyObject(c, { status: "ok" })
  })

  return importRoute
}
