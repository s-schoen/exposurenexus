import { describe, expect, expectTypeOf, it } from "vitest"
import { EventBus } from "./eventbus.js"
import type { DomainEventPayloadBase } from "./events/index.js"

type UserCreatedEvent = DomainEventPayloadBase<
  "user.created",
  { userId: string }
>
type UserDeletedEvent = DomainEventPayloadBase<
  "user.deleted",
  { userId: string }
>
type UserAuthenticationFailureEvent = DomainEventPayloadBase<
  "user.authentication.failure",
  { reason: string; userId?: string }
>
type FindingCreatedEvent = DomainEventPayloadBase<
  "finding.created",
  { findingId: string }
>

type TestEvent =
  | UserCreatedEvent
  | UserDeletedEvent
  | UserAuthenticationFailureEvent
  | FindingCreatedEvent

function event<TSubject extends TestEvent["subject"]>(
  subject: TSubject,
  data: Extract<TestEvent, { subject: TSubject }>["data"]
): Extract<TestEvent, { subject: TSubject }> {
  return {
    id: `event-${subject}`,
    source: "eventbus-test",
    subject,
    time: new Date("2026-01-01T00:00:00.000Z"),
    data
  } as Extract<TestEvent, { subject: TSubject }>
}

describe("EventBus", () => {
  it("emits events to matching listeners in registration order", async () => {
    const eventbus = new EventBus<TestEvent>()
    const calls: string[] = []

    eventbus.on("user.created", (receivedEvent) => {
      calls.push(`exact:${receivedEvent.subject}:${receivedEvent.data.userId}`)
    })

    eventbus.on("user.*", (receivedEvent) => {
      calls.push(
        `wildcard:${receivedEvent.subject}:${receivedEvent.data.userId}`
      )
    })

    await eventbus.emit(event("user.created", { userId: "user-1" }))

    expect(calls).toEqual([
      "exact:user.created:user-1",
      "wildcard:user.created:user-1"
    ])
  })

  it("matches namespace wildcards for descendants but not the namespace itself", async () => {
    const eventbus = new EventBus()
    const calls: string[] = []

    eventbus.on("user.*", (receivedEvent) => {
      calls.push(receivedEvent.subject)
    })

    await eventbus.emit({ subject: "user" })
    await eventbus.emit({ subject: "user.created" })
    await eventbus.emit({ subject: "user.profile.updated" })

    expect(calls).toEqual(["user.created", "user.profile.updated"])
  })

  it("supports a global wildcard listener", async () => {
    const eventbus = new EventBus()
    const calls: string[] = []

    eventbus.on("*", (receivedEvent) => {
      calls.push(receivedEvent.subject)
    })

    await eventbus.emit({ subject: "user.created" })
    await eventbus.emit({ subject: "billing.invoice.paid" })

    expect(calls).toEqual(["user.created", "billing.invoice.paid"])
  })

  it("does not call exact listeners for other events", async () => {
    const eventbus = new EventBus<TestEvent>()
    const calls: string[] = []

    eventbus.on("user.created", () => {
      calls.push("created")
    })

    await eventbus.emit(event("user.deleted", { userId: "user-1" }))

    expect(calls).toEqual([])
  })

  it("removes once listeners before their first matching invocation", async () => {
    const eventbus = new EventBus<TestEvent>()
    const calls: string[] = []

    eventbus.once("user.*", (receivedEvent) => {
      calls.push(receivedEvent.subject)
    })

    await eventbus.emit(event("user.created", { userId: "user-1" }))
    await eventbus.emit(event("user.deleted", { userId: "user-1" }))

    expect(calls).toEqual(["user.created"])
  })

  it("removes unused once listeners with their unsubscribe functions", async () => {
    const eventbus = new EventBus<TestEvent>()
    const calls: string[] = []

    const unsubscribe = eventbus.once("user.created", () => {
      calls.push("created")
    })

    unsubscribe()
    await eventbus.emit(event("user.created", { userId: "user-1" }))

    expect(calls).toEqual([])
  })

  it("removes listeners with unsubscribe functions and off", async () => {
    const eventbus = new EventBus<TestEvent>()
    const calls: string[] = []
    const listener = () => {
      calls.push("listener")
    }

    const unsubscribe = eventbus.on("user.created", () => {
      calls.push("unsubscribed")
    })
    eventbus.on("user.created", listener)

    unsubscribe()
    eventbus.off("user.created", listener)
    await eventbus.emit(event("user.created", { userId: "user-1" }))

    expect(calls).toEqual([])
  })

  it("handles listener failures and continues emitting", async () => {
    const eventbus = new EventBus<TestEvent>()
    const calls: string[] = []

    eventbus.on("user.created", () => {
      calls.push("before-error")
      throw new Error("failed")
    })

    eventbus.onError(({ event: failedEvent, listenerEventName }) => {
      calls.push(`error:${failedEvent.subject}:${listenerEventName}`)
    })

    eventbus.on("user.*", () => {
      calls.push("after-error")
    })

    await expect(
      eventbus.emit(event("user.created", { userId: "user-1" }))
    ).resolves.toBeUndefined()

    expect(calls).toEqual([
      "before-error",
      "error:user.created:user.created",
      "after-error"
    ])
  })

  it("swallows error handler failures", async () => {
    const eventbus = new EventBus<TestEvent>()

    eventbus.on("user.created", () => {
      throw new Error("listener failed")
    })

    eventbus.onError(() => {
      throw new Error("error handler failed")
    })

    await expect(
      eventbus.emit(event("user.created", { userId: "user-1" }))
    ).resolves.toBeUndefined()
  })

  it("clears the active error handler with its unsubscribe function", async () => {
    const eventbus = new EventBus<TestEvent>()
    const calls: string[] = []

    eventbus.on("user.created", () => {
      throw new Error("listener failed")
    })

    const unsubscribe = eventbus.onError(() => {
      calls.push("error")
    })

    unsubscribe()

    await expect(
      eventbus.emit(event("user.created", { userId: "user-1" }))
    ).resolves.toBeUndefined()

    expect(calls).toEqual([])
  })

  it("does not clear a newer error handler from an older unsubscribe function", async () => {
    const eventbus = new EventBus<TestEvent>()
    const calls: string[] = []

    eventbus.on("user.created", () => {
      throw new Error("listener failed")
    })

    const unsubscribeOldHandler = eventbus.onError(() => {
      calls.push("old")
    })

    eventbus.onError(() => {
      calls.push("new")
    })

    unsubscribeOldHandler()

    await eventbus.emit(event("user.created", { userId: "user-1" }))

    expect(calls).toEqual(["new"])
  })

  it("narrows listener event types from exact and wildcard listener names", () => {
    const eventbus = new EventBus<TestEvent>()

    eventbus.on("user.created", (receivedEvent) => {
      expectTypeOf(receivedEvent).toEqualTypeOf<Readonly<UserCreatedEvent>>()
      expectTypeOf(receivedEvent.subject).toEqualTypeOf<"user.created">()
      expectTypeOf(receivedEvent.data.userId).toEqualTypeOf<string>()

      // @ts-expect-error listener events are readonly
      receivedEvent.subject = "user.deleted"
    })

    eventbus.on("user.*", (receivedEvent) => {
      expectTypeOf(receivedEvent.subject).toEqualTypeOf<
        "user.created" | "user.deleted" | "user.authentication.failure"
      >()

      if (receivedEvent.subject === "user.authentication.failure") {
        expectTypeOf(receivedEvent.data.reason).toEqualTypeOf<string>()
      } else {
        expectTypeOf(receivedEvent.data.userId).toEqualTypeOf<string>()
      }
    })

    eventbus.on("user.authentication.*", (receivedEvent) => {
      expectTypeOf(
        receivedEvent.subject
      ).toEqualTypeOf<"user.authentication.failure">()
      expectTypeOf(receivedEvent.data.reason).toEqualTypeOf<string>()
    })

    eventbus.on("*", (receivedEvent) => {
      expectTypeOf(receivedEvent.subject).toEqualTypeOf<TestEvent["subject"]>()
    })

    const assertRejectedTypes = () => {
      // @ts-expect-error unknown listener names are rejected
      eventbus.on("asset.created", () => {})

      // @ts-expect-error namespace listeners must use a wildcard
      eventbus.on("user", () => {})

      // @ts-expect-error only known events can be emitted
      void eventbus.emit({ subject: "asset.created" })
    }
    void assertRejectedTypes
  })
})
