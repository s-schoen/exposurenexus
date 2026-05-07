import { describe, expect, it } from "vitest"
import { EventBus } from "./eventbus.js"

describe("EventBus", () => {
  it("emits payloads to matching listeners in registration order", async () => {
    const eventbus = new EventBus<{ userId: string }>()
    const calls: string[] = []

    eventbus.on("user.created", (payload, eventName) => {
      calls.push(`exact:${eventName}:${payload.userId}`)
    })

    eventbus.on("user.*", (payload, eventName) => {
      calls.push(`wildcard:${eventName}:${payload.userId}`)
    })

    await eventbus.emit("user.created", { userId: "user-1" })

    expect(calls).toEqual([
      "exact:user.created:user-1",
      "wildcard:user.created:user-1"
    ])
  })

  it("matches namespace wildcards for descendants but not the namespace itself", async () => {
    const eventbus = new EventBus<undefined>()
    const calls: string[] = []

    eventbus.on("user.*", (_, eventName) => {
      calls.push(eventName)
    })

    await eventbus.emit("user", undefined)
    await eventbus.emit("user.created", undefined)
    await eventbus.emit("user.profile.updated", undefined)

    expect(calls).toEqual(["user.created", "user.profile.updated"])
  })

  it("supports a global wildcard listener", async () => {
    const eventbus = new EventBus<undefined>()
    const calls: string[] = []

    eventbus.on("*", (_, eventName) => {
      calls.push(eventName)
    })

    await eventbus.emit("user.created", undefined)
    await eventbus.emit("billing.invoice.paid", undefined)

    expect(calls).toEqual(["user.created", "billing.invoice.paid"])
  })

  it("does not call exact listeners for other events", async () => {
    const eventbus = new EventBus<undefined>()
    const calls: string[] = []

    eventbus.on("user.created", () => {
      calls.push("created")
    })

    await eventbus.emit("user.deleted", undefined)

    expect(calls).toEqual([])
  })

  it("removes once listeners before their first matching invocation", async () => {
    const eventbus = new EventBus<undefined>()
    const calls: string[] = []

    eventbus.once("user.*", (_, eventName) => {
      calls.push(eventName)
    })

    await eventbus.emit("user.created", undefined)
    await eventbus.emit("user.deleted", undefined)

    expect(calls).toEqual(["user.created"])
  })

  it("removes unused once listeners with their unsubscribe functions", async () => {
    const eventbus = new EventBus<undefined>()
    const calls: string[] = []

    const unsubscribe = eventbus.once("user.created", () => {
      calls.push("created")
    })

    unsubscribe()
    await eventbus.emit("user.created", undefined)

    expect(calls).toEqual([])
  })

  it("removes listeners with unsubscribe functions and off", async () => {
    const eventbus = new EventBus<undefined>()
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
    await eventbus.emit("user.created", undefined)

    expect(calls).toEqual([])
  })

  it("handles listener failures and continues emitting", async () => {
    const eventbus = new EventBus<undefined>()
    const calls: string[] = []

    eventbus.on("user.created", () => {
      calls.push("before-error")
      throw new Error("failed")
    })

    eventbus.onError(({ eventName, listenerEventName }) => {
      calls.push(`error:${eventName}:${listenerEventName}`)
    })

    eventbus.on("user.*", () => {
      calls.push("after-error")
    })

    await expect(
      eventbus.emit("user.created", undefined)
    ).resolves.toBeUndefined()

    expect(calls).toEqual([
      "before-error",
      "error:user.created:user.created",
      "after-error"
    ])
  })

  it("swallows error handler failures", async () => {
    const eventbus = new EventBus<undefined>()

    eventbus.on("user.created", () => {
      throw new Error("listener failed")
    })

    eventbus.onError(() => {
      throw new Error("error handler failed")
    })

    await expect(
      eventbus.emit("user.created", undefined)
    ).resolves.toBeUndefined()
  })

  it("clears the active error handler with its unsubscribe function", async () => {
    const eventbus = new EventBus<undefined>()
    const calls: string[] = []

    eventbus.on("user.created", () => {
      throw new Error("listener failed")
    })

    const unsubscribe = eventbus.onError(() => {
      calls.push("error")
    })

    unsubscribe()

    await expect(
      eventbus.emit("user.created", undefined)
    ).resolves.toBeUndefined()

    expect(calls).toEqual([])
  })

  it("does not clear a newer error handler from an older unsubscribe function", async () => {
    const eventbus = new EventBus<undefined>()
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

    await eventbus.emit("user.created", undefined)

    expect(calls).toEqual(["new"])
  })
})
