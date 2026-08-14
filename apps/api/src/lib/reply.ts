import { createArrayReply, createObjectReply } from "@exposurenexus/types/api";

import type { Context } from "hono";

export function replyObject(c: Context, data: object, created: boolean = false) {
  const correlationId = c.get("requestId");
  c.status(created ? 201 : 200);
  return c.json(createObjectReply(correlationId, data));
}

export function replyArray(c: Context, data: object[]) {
  const correlationId = c.get("requestId");
  c.status(200);
  return c.json(createArrayReply(correlationId, data));
}
