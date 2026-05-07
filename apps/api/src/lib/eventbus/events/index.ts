import { randomUUID } from "node:crypto"
import type { UserEventPayloads } from "./user.js"
import type { AuthEventPayloads } from "./auth.js"

export type { AuthEventPayloads } from "./auth.js"
export type { UserEventPayloads } from "./user.js"

export type EventPayloads = UserEventPayloads & AuthEventPayloads

export type EventSubject = keyof EventPayloads & string

export interface DomainEventPayloadBase<
  TSubject extends string,
  TData extends object
> {
  id: string
  correlationId?: string
  actor?: string
  source: string
  subject: TSubject
  time: Date
  data: TData
}

export type DomainEvents<TPayloads extends Record<string, object>> = {
  [TSubject in keyof TPayloads & string]: DomainEventPayloadBase<
    TSubject,
    TPayloads[TSubject]
  >
}[keyof TPayloads & string]

export type DomainEvent = DomainEvents<EventPayloads>
export type DomainEventFor<TSubject extends EventSubject> = Extract<
  DomainEvent,
  { subject: TSubject }
>

export interface DomainEventEmitter {
  emit(event: DomainEvent): Promise<void>
}

export type CreateDomainEventPayloadInput<TSubject extends EventSubject> = Omit<
  DomainEventPayloadBase<TSubject, EventPayloads[TSubject]>,
  "id" | "time"
> &
  Partial<
    Pick<
      DomainEventPayloadBase<TSubject, EventPayloads[TSubject]>,
      "id" | "time"
    >
  >

export function createEventPayload<TSubject extends EventSubject>(
  input: CreateDomainEventPayloadInput<TSubject>
): DomainEventFor<TSubject> {
  const event = {
    ...input,
    id: input.id ?? randomUUID(),
    time: input.time ?? new Date()
  } satisfies DomainEventPayloadBase<TSubject, EventPayloads[TSubject]>

  return event as unknown as DomainEventFor<TSubject>
}
