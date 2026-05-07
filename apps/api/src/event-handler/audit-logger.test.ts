import { describe, expect, it, vi } from "vitest"
import type { Logger } from "pino"
import { createTestUser } from "../test/app.js"
import { EventBus } from "../lib/eventbus/eventbus.js"
import {
  createEventPayload,
  type DomainEvent
} from "../lib/eventbus/events/index.js"
import { REDACTED_EVENT_LOG_VALUE } from "./log-event.js"
import {
  DEFAULT_AUDIT_EVENT_PATTERNS,
  registerAuditLogger
} from "./audit-logger.js"

describe("registerAuditLogger", () => {
  const user = createTestUser()
  const session = {
    id: "a2ca50c9-1e4d-4533-97bc-e060f58b6747",
    sessionId: "stored-session-id-digest",
    userId: user.id,
    sourceIp: "203.0.113.10",
    userAgent: "Mozilla/5.0",
    createdAt: new Date("2026-05-07T10:00:00.000Z"),
    expiresAt: new Date("2026-05-07T22:00:00.000Z")
  }

  function createLogger() {
    return {
      info: vi.fn(),
      warn: vi.fn()
    } as unknown as Pick<Logger, "info" | "warn">
  }

  it("logs non-failure auth events at info with serialized fields", async () => {
    const eventBus = new EventBus<DomainEvent>()
    const logger = createLogger()
    const eventTime = new Date("2026-05-07T10:00:00.000Z")

    registerAuditLogger({ eventBus, logger })

    await eventBus.emit(
      createEventPayload({
        id: "event-1",
        time: eventTime,
        subject: "auth.session.created",
        source: "auth",
        correlationId: "request-1",
        data: {
          user,
          session
        }
      })
    )

    expect(logger.info).toHaveBeenCalledWith(
      {
        eventId: "event-1",
        eventSubject: "auth.session.created",
        eventSource: "auth",
        eventTime,
        correlationId: "request-1",
        data: {
          user,
          session: {
            ...session,
            sessionId: REDACTED_EVENT_LOG_VALUE
          }
        }
      },
      "auth.session.created"
    )
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it("logs auth failure events at warn with redacted data", async () => {
    const eventBus = new EventBus<DomainEvent>()
    const logger = createLogger()
    const eventTime = new Date("2026-05-07T10:05:00.000Z")

    registerAuditLogger({ eventBus, logger })

    await eventBus.emit(
      createEventPayload({
        id: "event-2",
        time: eventTime,
        subject: "auth.failure",
        source: "auth",
        correlationId: "request-2",
        data: {
          sessionId: "public-session-token",
          reason: "invalid-session"
        }
      })
    )

    expect(logger.warn).toHaveBeenCalledWith(
      {
        eventId: "event-2",
        eventSubject: "auth.failure",
        eventSource: "auth",
        eventTime,
        correlationId: "request-2",
        data: {
          sessionId: REDACTED_EVENT_LOG_VALUE,
          reason: "invalid-session"
        }
      },
      "auth.failure"
    )
    expect(logger.info).not.toHaveBeenCalled()
  })

  it("logs user events at info with serialized fields", async () => {
    const eventBus = new EventBus<DomainEvent>()
    const logger = createLogger()
    const eventTime = new Date("2026-05-07T10:10:00.000Z")

    registerAuditLogger({ eventBus, logger })

    await eventBus.emit(
      createEventPayload({
        id: "event-3",
        time: eventTime,
        subject: "user.created",
        source: "user-profile",
        actor: "admin-user",
        correlationId: "request-3",
        data: { user }
      })
    )

    expect(logger.info).toHaveBeenCalledWith(
      {
        eventId: "event-3",
        eventSubject: "user.created",
        eventSource: "user-profile",
        eventTime,
        actor: "admin-user",
        correlationId: "request-3",
        data: { user }
      },
      "user.created"
    )
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it("can restrict audit event patterns when configured", async () => {
    const eventBus = new EventBus<DomainEvent>()
    const logger = createLogger()

    registerAuditLogger({
      eventBus,
      logger,
      eventPatterns: ["auth.*"]
    })

    await eventBus.emit(
      createEventPayload({
        id: "event-4",
        subject: "user.created",
        source: "user-service",
        data: { user }
      })
    )

    expect(logger.info).not.toHaveBeenCalled()
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it("audits auth and user events by default", () => {
    expect(DEFAULT_AUDIT_EVENT_PATTERNS).toEqual(["auth.*", "user.*"])
  })
})
