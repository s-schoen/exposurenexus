import { describe, expect, it } from "vitest"
import type { DomainEventPayloadBase } from "../lib/eventbus/events/index.js"
import {
  REDACTED_EVENT_LOG_VALUE,
  redactLogProperties,
  serializeDomainEventForLog
} from "./log-event.js"

describe("serialize DomainEvent for log", () => {
  it("serializes common domain event fields", () => {
    const eventTime = new Date("2026-05-07T10:00:00.000Z")
    const event: DomainEventPayloadBase<"user.created", { userId: string }> = {
      id: "event-1",
      subject: "user.created",
      source: "user-service",
      time: eventTime,
      actor: "admin-user",
      correlationId: "request-1",
      data: {
        userId: "user-1"
      }
    }

    expect(serializeDomainEventForLog(event)).toEqual({
      eventId: "event-1",
      eventSubject: "user.created",
      eventSource: "user-service",
      eventTime,
      actor: "admin-user",
      correlationId: "request-1",
      data: {
        userId: "user-1"
      }
    })
  })

  it("redacts default secret keys recursively while preserving surrounding data", () => {
    const createdAt = new Date("2026-05-07T10:00:00.000Z")
    const expiresAt = new Date("2026-05-07T22:00:00.000Z")
    const event: DomainEventPayloadBase<
      "auth.session.created",
      {
        sessionId: string
        user: {
          username: string
          passwordHash: string
        }
        session: {
          id: string
          sessionId: string
          createdAt: Date
          expiresAt: Date
        }
        attempts: Array<{
          sessionId?: string
          nested?: {
            sessionId: string
            kept: string
          }
        }>
      }
    > = {
      id: "event-2",
      subject: "auth.session.created",
      source: "auth",
      time: createdAt,
      data: {
        sessionId: "public-session-token",
        user: {
          username: "alice",
          passwordHash: "argon2-password-hash"
        },
        session: {
          id: "session-1",
          sessionId: "stored-session-id-digest",
          createdAt,
          expiresAt
        },
        attempts: [
          {
            sessionId: "attempt-session-id"
          },
          {
            nested: {
              sessionId: "nested-session-id",
              kept: "visible"
            }
          }
        ]
      }
    }

    expect(serializeDomainEventForLog(event).data).toEqual({
      sessionId: REDACTED_EVENT_LOG_VALUE,
      user: {
        username: "alice",
        passwordHash: REDACTED_EVENT_LOG_VALUE
      },
      session: {
        id: "session-1",
        sessionId: REDACTED_EVENT_LOG_VALUE,
        createdAt,
        expiresAt
      },
      attempts: [
        {
          sessionId: REDACTED_EVENT_LOG_VALUE
        },
        {
          nested: {
            sessionId: REDACTED_EVENT_LOG_VALUE,
            kept: "visible"
          }
        }
      ]
    })
  })
})

describe("redact log properties", () => {
  it("redacts any configured property name recursively", () => {
    expect(
      redactLogProperties(
        {
          username: "alice",
          password: "correct-horse-battery-staple",
          sessionId: "visible-session-id",
          nested: {
            apiKey: "api-key",
            kept: "visible"
          },
          attempts: [
            {
              apiKey: "array-api-key"
            }
          ]
        },
        ["password", "apiKey"]
      )
    ).toEqual({
      username: "alice",
      password: REDACTED_EVENT_LOG_VALUE,
      sessionId: "visible-session-id",
      nested: {
        apiKey: REDACTED_EVENT_LOG_VALUE,
        kept: "visible"
      },
      attempts: [
        {
          apiKey: REDACTED_EVENT_LOG_VALUE
        }
      ]
    })
  })
})
