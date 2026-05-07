import { HTTPException } from "hono/http-exception"
import type { Context } from "hono"
import { createArrayReply, createObjectReply } from "@exposurenexus/types/api"

export function notFound(type: string, id: string) {
  throw new HTTPException(404, {
    message: `${type} with id ${id} does not exist`
  })
}

export function badRequest(message: string) {
  throw new HTTPException(400, { message })
}

export function replyObject(
  c: Context,
  data: object,
  created: boolean = false
) {
  const correlationId = c.get("requestId")
  c.status(created ? 201 : 200)
  return c.json(createObjectReply(correlationId, data))
}

export function replyArray(c: Context, data: object[]) {
  const correlationId = c.get("requestId")
  c.status(200)
  return c.json(createArrayReply(correlationId, data))
}
