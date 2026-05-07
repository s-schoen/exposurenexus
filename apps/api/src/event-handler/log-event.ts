import type { DomainEventPayloadBase } from "../lib/eventbus/events/index.js"

export const REDACTED_EVENT_LOG_VALUE = "[REDACTED]"
export const REDACTED_LOG_PROPERTY_NAMES = [
  "sessionId",
  "passwordHash"
] as const

export interface DomainEventLogFields<TSubject extends string = string> {
  eventId: string
  eventSubject: TSubject
  eventSource: string
  eventTime: Date
  actor?: string
  correlationId?: string
  data: unknown
}

function isRedactableObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !(value instanceof Date)
}

function redactValue(
  value: unknown,
  redactedProperties: ReadonlySet<string>
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, redactedProperties))
  }

  if (!isRedactableObject(value)) {
    return value
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [
      key,
      redactedProperties.has(key)
        ? REDACTED_EVENT_LOG_VALUE
        : redactValue(nestedValue, redactedProperties)
    ])
  )
}

export function redactLogProperties(
  value: unknown,
  propertyNames: readonly string[] = REDACTED_LOG_PROPERTY_NAMES
): unknown {
  return redactValue(value, new Set(propertyNames))
}

export function serializeDomainEventForLog<TSubject extends string>(
  event: DomainEventPayloadBase<TSubject, object>
): DomainEventLogFields<TSubject> {
  return {
    eventId: event.id,
    eventSubject: event.subject,
    eventSource: event.source,
    eventTime: event.time,
    ...(event.actor !== undefined ? { actor: event.actor } : {}),
    ...(event.correlationId !== undefined
      ? { correlationId: event.correlationId }
      : {}),
    data: redactLogProperties(event.data)
  }
}
