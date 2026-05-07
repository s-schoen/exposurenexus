import { describe, expect, it, vi } from "vitest"
import type { Logger } from "pino"
import { EventBus } from "../lib/eventbus/eventbus.js"
import {
  createEventPayload,
  type DomainEvent
} from "../lib/eventbus/events/index.js"
import { registerEventHandlers } from "./index.js"

describe("registerEventHandlers", () => {
  it("registers the audit logger with its own logger category", async () => {
    const eventBus = new EventBus<DomainEvent>()
    const logger = {
      info: vi.fn(),
      warn: vi.fn()
    } as unknown as Logger
    const loggerFactory = vi.fn(() => logger)

    registerEventHandlers({ eventBus, loggerFactory })

    await eventBus.emit(
      createEventPayload({
        id: "event-1",
        subject: "auth.success",
        source: "auth",
        data: {
          user: {
            id: "72fb3d48-4f34-4ec4-b7cd-9f68f5f4d19f",
            email: "tester@example.com",
            username: "tester",
            displayName: "Test User",
            enabled: true,
            roleIds: []
          }
        }
      })
    )

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "event-1",
        eventSubject: "auth.success"
      }),
      "auth.success"
    )
  })
})
