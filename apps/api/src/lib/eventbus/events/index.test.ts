import { describe, expect, expectTypeOf, it } from "vitest"
import { createTestUser } from "../../../test/app.js"
import {
  createDomainEventEmitter,
  createEventPayload,
  type DomainEvent,
  type DomainEventPayloadBase
} from "./index.js"
import type { AuthEventPayloads } from "./auth.js"
import type { UserEventPayloads } from "./user.js"

const uuidV4Regex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u

describe("createDomainEventPayload", () => {
  it("creates domain events with a generated id and timestamp", () => {
    const before = new Date()
    const user = createTestUser()

    const event = createEventPayload({
      subject: "user.created",
      source: "user-service",
      actor: "admin-user",
      correlationId: "correlation-1",
      data: { user }
    })

    const after = new Date()

    expect(event).toMatchObject({
      source: "user-service",
      actor: "admin-user",
      correlationId: "correlation-1",
      subject: "user.created",
      data: { user }
    })
    expect(event.id).toMatch(uuidV4Regex)
    expect(event.time.getTime()).toBeGreaterThanOrEqual(before.getTime())
    expect(event.time.getTime()).toBeLessThanOrEqual(after.getTime())
  })

  it("allows generated metadata to be overridden", () => {
    const time = new Date("2026-01-01T00:00:00.000Z")
    const user = createTestUser()

    const event = createEventPayload({
      id: "event-1",
      time,
      subject: "user.deleted",
      source: "user-service",
      data: { user }
    })

    expect(event.id).toBe("event-1")
    expect(event.time).toBe(time)
  })

  it("types event data from the subject", () => {
    const user = createTestUser()

    const event = createEventPayload({
      subject: "user.created",
      source: "user-service",
      data: { user }
    })

    expectTypeOf(event).toEqualTypeOf<
      DomainEventPayloadBase<"user.created", UserEventPayloads["user.created"]>
    >()
    expectTypeOf(event).toMatchTypeOf<DomainEvent>()

    const assertRejectedTypes = () => {
      createEventPayload({
        subject: "user.created",
        source: "user-service",
        // @ts-expect-error data must match the selected subject
        data: { previous: user, current: user }
      })

      createEventPayload({
        // @ts-expect-error only known event subjects can be created
        subject: "finding.created",
        source: "finding-service",
        data: { user }
      })
    }
    void assertRejectedTypes
  })

  it("includes auth events in the aggregate event catalog", () => {
    const user = createTestUser()
    const session = {
      id: "48f2e3a5-4560-4a47-85b6-137106940bbb",
      sessionId: "stored-session-id-digest",
      userId: user.id,
      sourceIp: "203.0.113.10",
      userAgent: "Mozilla/5.0",
      createdAt: new Date("2026-04-26T08:00:00.000Z"),
      expiresAt: new Date("2026-04-26T20:00:00.000Z")
    }

    const event = createEventPayload({
      subject: "auth.session.created",
      source: "auth-service",
      data: { user, session }
    })

    expectTypeOf(event).toEqualTypeOf<
      DomainEventPayloadBase<
        "auth.session.created",
        AuthEventPayloads["auth.session.created"]
      >
    >()
    expectTypeOf(event).toMatchTypeOf<DomainEvent>()
  })

  it("creates source-bound emitters with subject-specific payload types", () => {
    const emittedEvents: DomainEvent[] = []
    const user = createTestUser()
    const emitUserEvent = createDomainEventEmitter<
      "user.created" | "user.updated"
    >(
      {
        async emit(event) {
          emittedEvents.push(event)
        }
      },
      "user-service"
    )

    emitUserEvent(
      "user.created",
      { user },
      {
        actor: "admin-user",
        correlationId: "correlation-1"
      }
    )

    expect(emittedEvents).toHaveLength(1)
    expect(emittedEvents[0]).toMatchObject({
      source: "user-service",
      actor: "admin-user",
      correlationId: "correlation-1",
      subject: "user.created",
      data: { user }
    })

    const assertRejectedTypes = () => {
      emitUserEvent(
        // @ts-expect-error emitter only accepts the configured subject subset
        "user.deleted",
        { user }
      )

      emitUserEvent(
        "user.created",
        // @ts-expect-error data must match the selected subject
        { previous: user, current: user }
      )
    }
    void assertRejectedTypes
  })
})
