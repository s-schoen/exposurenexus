import type { Context } from "hono"
import type { DomainEventContext } from "./eventbus/events/index.js"
import type { ContextVariables } from "./hono-schema.js"

export function requestEventContext(
  c: Context<{ Variables: ContextVariables }>
): DomainEventContext {
  const actor = c.get("user")?.id

  return {
    ...(actor !== undefined ? { actor } : {}),
    correlationId: c.get("requestId")
  }
}
