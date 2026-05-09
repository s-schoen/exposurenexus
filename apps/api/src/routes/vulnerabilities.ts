import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { notFound, replyArray, replyObject } from "../lib/reply.js"
import { z } from "zod/v4"
import {
  createVulnerabilitySchema,
  updateVulnerabilitySchema,
  type CreateVulnerability,
  type UpdateVulnerability,
  type Vulnerability
} from "@exposurenexus/types/model/vulnerability"
import type { UserProfile } from "@exposurenexus/types/model/user"
import type { ContextVariables } from "../lib/hono-schema.js"
import type { RequireDomainPermission } from "../middleware/auth.js"
import type { DomainEventContext } from "../lib/eventbus/events/index.js"
import { requestEventContext } from "../lib/request-event-context.js"
import { HTTPException } from "hono/http-exception"

interface VulnerabilityRouteService {
  listAll(): Promise<Vulnerability[]>
  getByID(id: string): Promise<Vulnerability | null>
  create(options: {
    vulnerability: CreateVulnerability
    user: UserProfile
    eventContext?: DomainEventContext
  }): Promise<Vulnerability>
  updateByID(options: {
    id: string
    vulnerability: UpdateVulnerability
    user: UserProfile
    eventContext?: DomainEventContext
  }): Promise<Vulnerability | null>
}

interface VulnerabilityRouteDependencies {
  requireDomainPermission: RequireDomainPermission
}

const idParamValidator = zValidator("param", z.object({ id: z.uuidv4() }))

export function createVulnerabilityRoute(
  vulnerabilityService: VulnerabilityRouteService,
  { requireDomainPermission }: VulnerabilityRouteDependencies
) {
  const vulnerability = new Hono<{ Variables: ContextVariables }>()

  vulnerability.get(
    "/",
    requireDomainPermission("vulnerability", "read"),
    async (c) => {
      const vulns = await vulnerabilityService.listAll()
      return replyArray(c, vulns)
    }
  )

  vulnerability.post(
    "/",
    requireDomainPermission("vulnerability", "write"),
    zValidator("json", createVulnerabilitySchema),
    async (c) => {
      const body = c.req.valid("json")
      const user = c.get("user")

      if (!user) {
        throw new HTTPException(401, { message: "Unauthorized" })
      }

      const createdVulnerability = await vulnerabilityService.create({
        vulnerability: body,
        user,
        eventContext: requestEventContext(c)
      })

      return replyObject(c, createdVulnerability, true)
    }
  )

  vulnerability.get(
    "/:id",
    requireDomainPermission("vulnerability", "read"),
    idParamValidator,
    async (c) => {
      const params = c.req.valid("param")

      const vulnResult = await vulnerabilityService.getByID(params.id)
      if (!vulnResult) {
        notFound("vulnerability", params.id)
      }

      return replyObject(c, vulnResult!)
    }
  )

  vulnerability.put(
    "/:id",
    requireDomainPermission("vulnerability", "write"),
    idParamValidator,
    zValidator("json", updateVulnerabilitySchema),
    async (c) => {
      const params = c.req.valid("param")
      const body = c.req.valid("json")
      const user = c.get("user")

      if (!user) {
        throw new HTTPException(401, { message: "Unauthorized" })
      }

      const updatedVulnerability = await vulnerabilityService.updateByID({
        id: params.id,
        vulnerability: body,
        user,
        eventContext: requestEventContext(c)
      })
      if (!updatedVulnerability) {
        notFound("vulnerability", params.id)
      }

      return replyObject(c, updatedVulnerability!)
    }
  )

  return vulnerability
}
