import { Hono } from "hono"
import { notFound, replyArray, replyObject } from "../lib/reply.js"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod/v4"
import { createFindingSchema, type Finding } from "@openvlp/types/model/finding"
import type { User } from "better-auth"
import type { ContextVariables } from "../lib/hono-schema.js"

interface FindingRouteService {
  listAll(): Promise<Finding[]>
  getByID(id: string): Promise<Finding | null>
  create(options: {
    finding: typeof createFindingSchema._output
    user: User
  }): Promise<Finding>
  update(options: {
    id: string
    finding: typeof createFindingSchema._output
    user: User
  }): Promise<Finding | null>
  deleteByID(id: string): Promise<Finding | null>
}

const idParamValidator = zValidator("param", z.object({ id: z.uuidv4() }))

export function createFindingRoute(findingService: FindingRouteService) {
  const finding = new Hono<{ Variables: ContextVariables }>()

  finding.get("/", async (c) => {
    const findings = await findingService.listAll()
    return replyArray(c, findings)
  })

  finding.get("/:id", idParamValidator, async (c) => {
    const params = c.req.valid("param")

    const findingResult = await findingService.getByID(params.id)
    if (!findingResult) {
      notFound("finding", params.id)
    }

    return replyObject(c, findingResult!)
  })

  finding.post("/", zValidator("json", createFindingSchema), async (c) => {
    const body = c.req.valid("json")
    const user: User = c.get("user")

    const createdFinding = await findingService.create({
      finding: body,
      user
    })

    return replyObject(c, createdFinding, true)
  })

  finding.put(
    "/:id",
    idParamValidator,
    zValidator("json", createFindingSchema),
    async (c) => {
      const body = c.req.valid("json")
      const params = c.req.valid("param")
      const user: User = c.get("user")

      const updatedFinding = await findingService.update({
        id: params.id,
        finding: body,
        user
      })

      if (!updatedFinding) {
        notFound("finding", params.id)
      }

      return replyObject(c, updatedFinding!)
    }
  )

  finding.delete("/:id", idParamValidator, async (c) => {
    const params = c.req.valid("param")

    const deleted = await findingService.deleteByID(params.id)
    if (!deleted) {
      notFound("finding", params.id)
    }

    return replyObject(c, deleted!)
  })

  return finding
}
