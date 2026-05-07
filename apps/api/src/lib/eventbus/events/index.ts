export type EventPayloads = {
  "user.created": {
    userId: string
  }
  "user.updated": {
    userId: string
  }
  "user.deleted": {
    userId: string
  }
  "user.authentication.success": {
    userId: string
  }
  "user.authentication.failure": {
    userId?: string
    reason: string
  }
}

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
