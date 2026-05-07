import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { notFound, replyArray, replyObject } from "../lib/reply.js"
import { z } from "zod/v4"
import type { Vulnerability } from "@exposurenexus/types/model/vulnerability"
import type { ContextVariables } from "../lib/hono-schema.js"
import type { RequireDomainPermission } from "../middleware/auth.js"

interface VulnerabilityRouteService {
  listAll(): Promise<Vulnerability[]>
  getByID(id: string): Promise<Vulnerability | null>
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

  return vulnerability
}
