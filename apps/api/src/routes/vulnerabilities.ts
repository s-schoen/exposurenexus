import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { notFound, replyArray, replyObject } from "../lib/reply.js"
import { z } from "zod/v4"
import {
  createVulnerabilitySourceMappingSchema,
  createVulnerabilitySchema,
  updateVulnerabilitySourceMappingSchema,
  updateVulnerabilitySchema
} from "@exposurenexus/types/model/vulnerability"
import type { ContextVariables } from "../lib/hono-schema.js"
import type { RequireDomainPermission } from "../middleware/auth.js"
import { requestEventContext } from "../lib/request-event-context.js"
import { HTTPException } from "hono/http-exception"
import type { VulnerabilityService } from "../service/vulnerability.js"

interface VulnerabilityRouteDependencies {
  requireDomainPermission: RequireDomainPermission
}

const idParamValidator = zValidator("param", z.object({ id: z.uuidv4() }))
const mappingIdParamValidator = zValidator(
  "param",
  z.object({ mappingId: z.uuidv4() })
)
const mappingQueryValidator = zValidator(
  "query",
  z.object({ source: z.string().trim().min(1).optional() })
)

export function createVulnerabilityRoute(
  vulnerabilityService: VulnerabilityService,
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
    "/mappings",
    requireDomainPermission("vulnerability", "read"),
    mappingQueryValidator,
    async (c) => {
      const query = c.req.valid("query")
      const mappings = await vulnerabilityService.listMappings(query.source)

      return replyArray(c, mappings)
    }
  )

  vulnerability.put(
    "/mappings/:mappingId",
    requireDomainPermission("vulnerability", "write"),
    mappingIdParamValidator,
    zValidator("json", updateVulnerabilitySourceMappingSchema),
    async (c) => {
      const params = c.req.valid("param")
      const body = c.req.valid("json")
      const mapping = await vulnerabilityService.updateMappingByID({
        id: params.mappingId,
        mapping: body,
        eventContext: requestEventContext(c)
      })
      if (!mapping) {
        notFound("vulnerability source mapping", params.mappingId)
      }

      return replyObject(c, mapping!)
    }
  )

  vulnerability.delete(
    "/mappings/:mappingId",
    requireDomainPermission("vulnerability", "write"),
    mappingIdParamValidator,
    async (c) => {
      const params = c.req.valid("param")
      const mapping = await vulnerabilityService.deleteMappingByID(
        params.mappingId,
        requestEventContext(c)
      )
      if (!mapping) {
        notFound("vulnerability source mapping", params.mappingId)
      }

      return replyObject(c, mapping!)
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

  vulnerability.get(
    "/:id/mappings",
    requireDomainPermission("vulnerability", "read"),
    idParamValidator,
    async (c) => {
      const params = c.req.valid("param")
      const mappings = await vulnerabilityService.listMappingsByVulnerabilityID(
        params.id
      )
      if (!mappings) {
        notFound("vulnerability", params.id)
      }

      return replyArray(c, mappings!)
    }
  )

  vulnerability.post(
    "/:id/mappings",
    requireDomainPermission("vulnerability", "write"),
    idParamValidator,
    zValidator("json", createVulnerabilitySourceMappingSchema),
    async (c) => {
      const params = c.req.valid("param")
      const body = c.req.valid("json")
      const mapping = await vulnerabilityService.createMapping({
        vulnerabilityId: params.id,
        source: body.source,
        matchQuery: body.matchQuery,
        eventContext: requestEventContext(c)
      })
      if (!mapping) {
        notFound("vulnerability", params.id)
      }

      return replyObject(c, mapping!, true)
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

  vulnerability.delete(
    "/:id",
    requireDomainPermission("vulnerability", "delete"),
    idParamValidator,
    async (c) => {
      const params = c.req.valid("param")

      const deletedVulnerability = await vulnerabilityService.deleteByID(
        params.id,
        requestEventContext(c)
      )
      if (!deletedVulnerability) {
        notFound("vulnerability", params.id)
      }

      return replyObject(c, deletedVulnerability!)
    }
  )

  return vulnerability
}
