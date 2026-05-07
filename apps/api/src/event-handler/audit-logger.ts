import type { Logger } from "pino"
import type { EventBus, EventListenerName } from "../lib/eventbus/eventbus.js"
import type { DomainEvent } from "../lib/eventbus/events/index.js"
import { serializeDomainEventForLog } from "./log-event.js"

export const DEFAULT_AUDIT_EVENT_PATTERNS = [
  "auth.*",
  "user.*",
  "finding.*",
  "vulnerability.*"
] as const satisfies readonly EventListenerName<DomainEvent>[]

const WARN_AUDIT_EVENT_SUBJECTS = new Set<string>(["auth.failure"])

interface RegisterAuditLoggerDependencies {
  eventBus: EventBus<DomainEvent>
  logger: Pick<Logger, "info" | "warn">
  eventPatterns?: readonly EventListenerName<DomainEvent>[]
}

export function registerAuditLogger({
  eventBus,
  logger,
  eventPatterns = DEFAULT_AUDIT_EVENT_PATTERNS
}: RegisterAuditLoggerDependencies): void {
  for (const eventPattern of eventPatterns) {
    eventBus.on(eventPattern, (event) => {
      const fields = serializeDomainEventForLog(event)

      if (WARN_AUDIT_EVENT_SUBJECTS.has(event.subject)) {
        logger.warn(fields, event.subject)
        return
      }

      logger.info(fields, event.subject)
    })
  }
}
