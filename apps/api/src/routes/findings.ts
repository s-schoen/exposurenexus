import { Hono, type Context } from "hono"
import { HTTPException } from "hono/http-exception"
import { notFound, replyArray, replyObject } from "../lib/reply.js"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod/v4"
import {
  createFindingSchema,
  updateFindingSchema,
  type Finding
} from "@openvlp/types/model/finding"
import type { UserProfile } from "@openvlp/types/model/user"
import type { ContextVariables } from "../lib/hono-schema.js"
import type { DomainEventContext } from "../lib/eventbus/events/index.js"
import type { RequireDomainPermission } from "../middleware/auth.js"

interface FindingRouteService {
  listAll(): Promise<Finding[]>
  getByID(id: string): Promise<Finding | null>
  create(options: {
    finding: typeof createFindingSchema._output
    user: UserProfile
    eventContext?: DomainEventContext
  }): Promise<Finding>
  update(options: {
    id: string
    finding: typeof updateFindingSchema._output
    user: UserProfile
    eventContext?: DomainEventContext
  }): Promise<Finding | null>
  deleteByID(options: {
    id: string
    eventContext?: DomainEventContext
  }): Promise<Finding | null>
}

interface FindingRouteDependencies {
  requireDomainPermission: RequireDomainPermission
}

const idParamValidator = zValidator("param", z.object({ id: z.uuidv4() }))

function requestEventContext(
  c: Context<{ Variables: ContextVariables }>
): DomainEventContext {
  const actor = c.get("user")?.id

  return {
    ...(actor !== undefined ? { actor } : {}),
    correlationId: c.get("requestId")
  }
}

export function createFindingRoute(
  findingService: FindingRouteService,
  { requireDomainPermission }: FindingRouteDependencies
) {
  const finding = new Hono<{ Variables: ContextVariables }>()

  finding.get("/", requireDomainPermission("finding", "read"), async (c) => {
    const findings = await findingService.listAll()
    return replyArray(c, findings)
  })

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

      const updatedFinding = await findingService.update({
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

      const deleted = await findingService.deleteByID({
        id: params.id,
        eventContext: requestEventContext(c)
      })
      if (!deleted) {
        notFound("finding", params.id)
      }

      return replyObject(c, deleted!)
    }
  )

  return finding
}
