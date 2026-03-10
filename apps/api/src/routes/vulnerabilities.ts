import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import * as vulnerabilityService from "../service/vulnerability.js"
import { notFound, replyArray, replyObject } from "../lib/reply.js"
import { z } from "zod/v4"

const vulnerability = new Hono()

const idParamValidator = zValidator("param", z.object({ id: z.uuidv4() }))

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

export default vulnerability
