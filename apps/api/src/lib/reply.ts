import type { APISingleDataReply, APIArrayDataReply } from "@exposurenexus/contracts/api";
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

function createObjectReply<T extends object>(
  correlationId: string,
  data: T,
): APISingleDataReply<T> {
  return { correlationId, data };
}

function createArrayReply<T extends object>(
  correlationId: string,
  data: T[],
): APIArrayDataReply<T> {
  return {
    correlationId,
    data: {
      items: data,
      totalItems: data.length,
      startIndex: 0,
      currentItemCount: data.length,
    },
  };
}
