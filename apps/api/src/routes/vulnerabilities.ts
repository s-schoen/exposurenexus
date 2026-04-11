import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { notFound, replyArray, replyObject } from "../lib/reply.js"
import { z } from "zod/v4"
import type { Vulnerability } from "@openvlp/types/model/vulnerability"

interface VulnerabilityRouteService {
  listAll(): Promise<Vulnerability[]>
  getByID(id: string): Promise<Vulnerability | null>
}

const idParamValidator = zValidator("param", z.object({ id: z.uuidv4() }))

export function createVulnerabilityRoute(
  vulnerabilityService: VulnerabilityRouteService
) {
  const vulnerability = new Hono()

  vulnerability.get("/", async (c) => {
    const vulns = await vulnerabilityService.listAll()
    return replyArray(c, vulns)
  })

  vulnerability.get("/:id", idParamValidator, async (c) => {
    const params = c.req.valid("param")

    const vulnResult = await vulnerabilityService.getByID(params.id)
    if (!vulnResult) {
      notFound("vulnerability", params.id)
    }

    return replyObject(c, vulnResult!)
  })

  return vulnerability
}
