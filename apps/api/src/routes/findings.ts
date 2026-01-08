import { Hono } from "hono"
import { notFound, replyArray, replyObject } from "../lib/reply.js"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod/v4"
import { createFindingSchema } from "@openvlp/types/model/finding"
import * as findingService from "../service/finding.js"
import type { User } from "better-auth"

const finding = new Hono()

const idParamValidator = zValidator("param", z.object({ id: z.uuidv4() }))

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

  const now = new Date()

  // FIXME: register context types correctly
  const user: User = c.get("user")

  const createdFinding = await findingService.create({
    finding: body,
    user: user
  })

  return replyObject(c, createdFinding, true)
})

finding.delete("/:id", idParamValidator, async (c) => {
  const params = c.req.valid("param")

  const deleted = await findingService.deleteByID(params.id)
  if (!deleted) {
    notFound("finding", params.id)
  }

  return replyObject(c, deleted!)
})

export default finding
