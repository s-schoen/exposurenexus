import { randomUUID } from "node:crypto"
import type { UserEventPayloads } from "./user.js"
import type { AuthEventPayloads } from "./auth.js"
import type { FindingEventPayloads } from "./finding.js"
import type { VulnerabilityEventPayloads } from "./vulnerability.js"
import type { AssetEventPayloads } from "./asset.js"
import type { CustomFieldEventPayloads } from "./custom-field.js"
import type { RoleEventPayloads } from "./role.js"

export type { AssetEventPayloads } from "./asset.js"
export type { AuthEventPayloads } from "./auth.js"
export type { CustomFieldEventPayloads } from "./custom-field.js"
export type { FindingEventPayloads } from "./finding.js"
export type { RoleEventPayloads } from "./role.js"
export type { UserEventPayloads } from "./user.js"
export type { VulnerabilityEventPayloads } from "./vulnerability.js"

export type EventPayloads = AssetEventPayloads &
  CustomFieldEventPayloads &
  UserEventPayloads &
  AuthEventPayloads &
  RoleEventPayloads &
  FindingEventPayloads &
  VulnerabilityEventPayloads

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

export interface DomainEventContext {
  correlationId?: string
  actor?: string
}

export type EmitDomainEvent<TSubject extends EventSubject = EventSubject> = <
  TSelectedSubject extends TSubject
>(
  subject: TSelectedSubject,
  data: EventPayloads[TSelectedSubject],
  context?: DomainEventContext
) => void

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

export function createDomainEventEmitter<
  TSubject extends EventSubject = EventSubject
>(
  domainEventEmitter: DomainEventEmitter,
  source: string
): EmitDomainEvent<TSubject> {
  return function emitDomainEvent<TSelectedSubject extends TSubject>(
    subject: TSelectedSubject,
    data: EventPayloads[TSelectedSubject],
    context: DomainEventContext = {}
  ): void {
    void domainEventEmitter.emit(
      createEventPayload({
        subject,
        source,
        ...(context.actor !== undefined ? { actor: context.actor } : {}),
        ...(context.correlationId !== undefined
          ? { correlationId: context.correlationId }
          : {}),
        data
      })
    )
  }
}
