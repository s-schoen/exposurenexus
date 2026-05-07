import type {
  DomainEvent,
  DomainEventEmitter,
  EventSubject
} from "../lib/eventbus/events/index.js"

export function createDomainEventCollector() {
  const events: DomainEvent[] = []
  const emitter: DomainEventEmitter = {
    async emit(event) {
      events.push(event)
    }
  }

  return {
    emitter,
    events,
    clear() {
      events.length = 0
    },
    subjects() {
      return events.map((event) => event.subject)
    },
    eventsFor<TSubject extends EventSubject>(subject: TSubject) {
      return events.filter(
        (event): event is Extract<DomainEvent, { subject: TSubject }> =>
          event.subject === subject
      )
    }
  }
}
