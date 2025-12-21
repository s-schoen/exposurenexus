import { Hono } from "hono"
import { notFound, replyArray, replyObject } from "../lib/reply.js"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod/v4"
import {
  createFinding,
  deleteFinding,
  getFindingByID,
  listFindings
} from "../lib/finding.js"
import { findingSchema } from "@openvlp/types/model/finding"
import { auth } from "../lib/auth.js"

const finding = new Hono()

const idParamValidator = zValidator("param", z.object({ id: z.uuidv4() }))

finding.get("/", async (c) => {
  const findings = await listFindings()
  return replyArray(c, findings)
})

finding.get("/:id", idParamValidator, async (c) => {
  const params = c.req.valid("param")

  const findingResult = await getFindingByID(params.id)
  if (!findingResult) {
    notFound("finding", params.id)
  }

  return replyObject(c, findingResult!)
})

finding.post(
  "/",
  zValidator(
    "json",
    findingSchema.omit({
      id: true,
      createdAt: true,
      updatedAt: true,
      createdBy: true,
      updatedBy: true,
      fingerprint: true
    })
  ),
  async (c) => {
    const body = c.req.valid("json")

    const now = new Date()

    // FIXME: register context types correctly
    const user: typeof auth.$Infer.Session.session = c.get("user")

    const createdFinding = await createFinding({
      id: "",
      createdAt: now,
      updatedAt: now,
      assetId: body.assetId,
      fingerprint: "",
      description: body.description,
      evidence: body.evidence,
      mitigation: body.mitigation,
      severity: body.severity,
      source: body.source,
      status: body.status,
      title: body.title,
      createdBy: user.id,
      updatedBy: user.id
    })

    return replyObject(c, createdFinding, true)
  }
)

finding.delete("/:id", idParamValidator, async (c) => {
  const params = c.req.valid("param")

  const deleted = await deleteFinding(params.id)
  if (!deleted) {
    notFound("finding", params.id)
  }

  return replyObject(c, deleted!)
})

export default finding
