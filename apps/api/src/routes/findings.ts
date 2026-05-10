import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { notFound, replyArray, replyObject } from "../lib/reply.js"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod/v4"
import {
  createFindingSchema,
  reclassifyFindingsSchema,
  updateFindingSchema
} from "@exposurenexus/types/model/finding"
import type { ContextVariables } from "../lib/hono-schema.js"
import { requestEventContext } from "../lib/request-event-context.js"
import type { RequireDomainPermission } from "../middleware/auth.js"
import type { FindingService } from "../service/finding.js"

interface FindingRouteDependencies {
  requireDomainPermission: RequireDomainPermission
}

const idParamValidator = zValidator("param", z.object({ id: z.uuidv4() }))

export function createFindingRoute(
  findingService: FindingService,
  { requireDomainPermission }: FindingRouteDependencies
) {
  const finding = new Hono<{ Variables: ContextVariables }>()

  finding.get("/", requireDomainPermission("finding", "read"), async (c) => {
    const findings = await findingService.listAll()
    return replyArray(c, findings)
  })

  finding.post(
    "/reclassify",
    requireDomainPermission("finding", "write"),
    zValidator("json", reclassifyFindingsSchema),
    async (c) => {
      const body = c.req.valid("json")
      const user = c.get("user")

      if (!user) {
        throw new HTTPException(401, { message: "Unauthorized" })
      }

      const result = await findingService.reclassify({
        reclassification: body,
        user,
        eventContext: requestEventContext(c)
      })

      return replyObject(c, result)
    }
  )

  finding.get(
    "/:id",
    requireDomainPermission("finding", "read"),
    idParamValidator,
    async (c) => {
      const params = c.req.valid("param")

      const findingResult = await findingService.getByID(params.id)
      if (!findingResult) {
        notFound("finding", params.id)
      }

      return replyObject(c, findingResult!)
    }
  )

  finding.post(
    "/",
    requireDomainPermission("finding", "write"),
    zValidator("json", createFindingSchema),
    async (c) => {
      const body = c.req.valid("json")
      const user = c.get("user")

      if (!user) {
        throw new HTTPException(401, { message: "Unauthorized" })
      }

      const createdFinding = await findingService.create({
        finding: body,
        user,
        eventContext: requestEventContext(c)
      })

      return replyObject(c, createdFinding, true)
    }
  )

  finding.put(
    "/:id",
    requireDomainPermission("finding", "write"),
    idParamValidator,
    zValidator("json", updateFindingSchema),
    async (c) => {
      const body = c.req.valid("json")
      const params = c.req.valid("param")
      const user = c.get("user")

      if (!user) {
        throw new HTTPException(401, { message: "Unauthorized" })
      }

      const updatedFinding = await findingService.updateByID({
        id: params.id,
        finding: body,
        user,
        eventContext: requestEventContext(c)
      })

      if (!updatedFinding) {
        notFound("finding", params.id)
      }

      return replyObject(c, updatedFinding!)
    }
  )

  finding.delete(
    "/:id",
    requireDomainPermission("finding", "delete"),
    idParamValidator,
    async (c) => {
      const params = c.req.valid("param")
      const user = c.get("user")

      if (!user) {
        throw new HTTPException(401, { message: "Unauthorized" })
      }

      const deleted = await findingService.deleteByID(
        params.id,
        requestEventContext(c)
      )
      if (!deleted) {
        notFound("finding", params.id)
      }

      return replyObject(c, deleted!)
    }
  )

  return finding
}
