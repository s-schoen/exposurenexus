import { HttpResponse } from "msw";

import type {
  APIArrayDataReply,
  APIErrorReply,
  APISingleDataReply,
} from "@exposurenexus/contracts/api";
import type { z } from "zod/v4";

// Envelopes mirror apps/api/src/lib/reply.ts so the UI's response parsers see the real shapes.

let correlationSequence = 0;

function nextCorrelationId(): string {
  correlationSequence += 1;
  return `mock-${correlationSequence}`;
}

export function replyObject<T extends object>(data: T, { created = false } = {}): Response {
  const reply: APISingleDataReply<T> = { correlationId: nextCorrelationId(), data };
  return HttpResponse.json(reply, { status: created ? 201 : 200 });
}

export function replyArray<T extends object>(items: Array<T>): Response {
  const reply: APIArrayDataReply<T> = {
    correlationId: nextCorrelationId(),
    data: {
      items,
      totalItems: items.length,
      startIndex: 0,
      currentItemCount: items.length,
    },
  };
  return HttpResponse.json(reply);
}

export function replyError(status: number, error: string, reason?: string): Response {
  const reply: APIErrorReply = {
    correlationId: nextCorrelationId(),
    status,
    error,
    ...(reason ? { reason } : {}),
  };
  return HttpResponse.json(reply, { status });
}

/** Same message as the API's `notFound(type, id)`. */
export function replyNotFound(resource: string, id: string): Response {
  return replyError(404, `${resource} with id ${id} does not exist`);
}

/** Like the API's validator: 400 for malformed JSON or a body the contracts schema rejects. */
export async function parseRequestBody<S extends z.ZodType>(
  request: Request,
  schema: S,
): Promise<{ data: z.output<S> } | { reply: Response }> {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return { reply: replyError(400, "Malformed JSON in request body") };
  }
  const result = schema.safeParse(json);
  if (!result.success) {
    return { reply: replyError(400, "Bad Request", result.error.message) };
  }
  return { data: result.data };
}
