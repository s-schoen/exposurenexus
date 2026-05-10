import { Hono } from "hono"
import { badRequest, unauthorized } from "../lib/api-error.js"
import { replyObject } from "../lib/reply.js"
import type { ContextVariables } from "../lib/hono-schema.js"
import { requestEventContext } from "../lib/request-event-context.js"
import type { Logger } from "pino"
import type { FindingImporter } from "../import/importer.js"
import type { RequireDomainPermission } from "../middleware/auth.js"

interface ImportRouteDependencies {
  importer: FindingImporter
  logger: Logger
  requireDomainPermission: RequireDomainPermission
}

export function createImportRoute({
  importer,
  logger,
  requireDomainPermission
}: ImportRouteDependencies) {
  const importRoute = new Hono<{ Variables: ContextVariables }>()

  importRoute.post(
    "/import",
    requireDomainPermission("import", "write"),
    async (c) => {
      const body = await c.req.parseBody()

      if (typeof body["type"] !== "string") {
        throw badRequest("expected type in form data")
      }
      const type = body["type"] as string

      if (!body["file"] || typeof body["file"] === "string") {
        throw badRequest("expected file in form data")
      }
      const file = body["file"] as File

      logger.info(
        `file uploaded: name=${file.name} size=${file.size} filetype=${file.type} type=${type}`
      )

      const buffer = Buffer.from(await file.arrayBuffer())
      const user = c.get("user")

      if (!user) {
        throw unauthorized()
      }

      const findings = await importer.parseFindingsFromFile(
        { user, eventContext: requestEventContext(c) },
        type,
        buffer
      )
      logger.info(`created ${findings.length} findings`)

      return replyObject(c, { status: "ok" })
    }
  )

  return importRoute
}
