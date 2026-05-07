import type { Logger } from "pino"
import type { EventBus } from "../lib/eventbus/eventbus.js"
import type { DomainEvent } from "../lib/eventbus/events/index.js"
import { registerAuditLogger } from "./audit-logger.js"

export type LoggerFactory = (moduleName: string) => Logger

interface RegisterEventHandlersDependencies {
  eventBus: EventBus<DomainEvent>
  loggerFactory: LoggerFactory
}

export function registerEventHandlers({
  eventBus,
  loggerFactory
}: RegisterEventHandlersDependencies): void {
  registerAuditLogger({
    eventBus,
    logger: loggerFactory("audit")
  })
}
