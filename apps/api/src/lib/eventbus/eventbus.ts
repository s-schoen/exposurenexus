export type EventSubject = {
  subject: string
}

type EventSubjectName<TEvent extends EventSubject> = TEvent["subject"] & string

type ReadonlyEvent<TEvent extends EventSubject> = TEvent extends unknown
  ? Readonly<TEvent>
  : never

export type EventListener<TEvent extends EventSubject> = (
  event: ReadonlyEvent<TEvent>
) => void | Promise<void>

// Builds every valid namespace wildcard for an event name.
// Example: "user.profile.updated" becomes "user.*" | "user.profile.*".
type NamespaceWildcard<TEventName extends string> =
  TEventName extends `${infer Namespace}.${infer Rest}`
    ?
        | `${Namespace}.*`
        | (Rest extends `${string}.${string}`
            ? `${Namespace}.${NamespaceWildcard<Rest>}`
            : never)
    : never

// When callers provide a literal event-name union, listener names are restricted
// to exact events, the global wildcard, and derived namespace wildcards. When
// the event-name type is the default broad `string`, listener names stay broad
// too so untyped buses remain ergonomic.
export type EventListenerName<TEvent extends EventSubject = EventSubject> =
  string extends EventSubjectName<TEvent>
    ? string
    :
        | EventSubjectName<TEvent>
        | "*"
        | NamespaceWildcard<EventSubjectName<TEvent>>

// Narrows the event passed into a listener callback based on the listener
// registration. A `user.*` listener only receives events whose subjects are
// below `user.`, while a `*` listener can receive any known event.
export type EventForListener<
  TEvent extends EventSubject,
  TListenerEventName extends EventListenerName<TEvent>
> =
  string extends EventSubjectName<TEvent>
    ? TEvent
    : TListenerEventName extends "*"
      ? TEvent
      : TListenerEventName extends `${infer Namespace}.*`
        ? Extract<TEvent, { subject: `${Namespace}.${string}` }>
        : Extract<TEvent, { subject: TListenerEventName }>

export type EventErrorContext<TEvent extends EventSubject> = {
  error: unknown
  event: ReadonlyEvent<TEvent>
  listenerEventName: EventListenerName<TEvent>
}

export type EventErrorHandler<TEvent extends EventSubject> = (
  context: EventErrorContext<TEvent>
) => void | Promise<void>

type ListenerEntry<TEvent extends EventSubject> = {
  eventName: EventListenerName<TEvent>
  listener: EventListener<TEvent>
  once: boolean
}

/**
 * A small async event bus with typed domain events and namespace wildcard
 * listeners.
 *
 * Listener names are derived from the event `subject` union when it is a
 * literal union. Exact names match only themselves, `*` matches every emitted
 * event, and names ending in `.*` match every descendant event below that
 * namespace. For example, `user.*` matches `user.created` and
 * `user.profile.updated`, but not `user`. When the event subject type is the
 * broad `string`, listener names remain plain strings.
 *
 * Listeners run sequentially in registration order. Listener failures are passed
 * to the configured `onError` handler and never cause `emit` to reject.
 */
export class EventBus<TEvent extends EventSubject = EventSubject> {
  private listeners: ListenerEntry<TEvent>[] = []
  private errorHandler?: EventErrorHandler<TEvent>

  /**
   * Registers a listener for an exact event name, `*`, or a namespace wildcard
   * such as `user.*`.
   *
   * @returns A function that removes this specific listener registration.
   */
  on<TListenerEventName extends EventListenerName<TEvent>>(
    eventName: TListenerEventName,
    listener: EventListener<EventForListener<TEvent, TListenerEventName>>
  ): () => void {
    const entry = {
      eventName,
      listener: listener as EventListener<TEvent>,
      once: false
    }
    this.listeners.push(entry)

    return () => this.removeEntry(entry)
  }

  /**
   * Registers a listener that is removed before its first matching invocation.
   *
   * @returns A function that removes this specific listener registration if it
   * has not already run.
   */
  once<TListenerEventName extends EventListenerName<TEvent>>(
    eventName: TListenerEventName,
    listener: EventListener<EventForListener<TEvent, TListenerEventName>>
  ): () => void {
    const entry = {
      eventName,
      listener: listener as EventListener<TEvent>,
      once: true
    }
    this.listeners.push(entry)

    return () => this.removeEntry(entry)
  }

  /**
   * Removes all registrations for the given listener function on the given
   * listener event name.
   */
  off<TListenerEventName extends EventListenerName<TEvent>>(
    eventName: TListenerEventName,
    listener: EventListener<EventForListener<TEvent, TListenerEventName>>
  ): void {
    this.listeners = this.listeners.filter(
      (entry) => entry.eventName !== eventName || entry.listener !== listener
    )
  }

  /**
   * Sets the handler that receives listener failures.
   *
   * Only one error handler is active at a time. If the handler throws or rejects,
   * that failure is swallowed so that `emit` still resolves successfully.
   *
   * @returns A function that clears this handler if it is still active.
   */
  onError(handler: EventErrorHandler<TEvent>): () => void {
    this.errorHandler = handler

    return () => {
      if (this.errorHandler === handler) {
        this.errorHandler = undefined
      }
    }
  }

  /**
   * Emits a typed event.
   *
   * Matching listeners are awaited sequentially in registration order. If a
   * listener throws or rejects, the error handler is awaited and emission then
   * continues with later listeners. This method always resolves successfully.
   */
  async emit(event: TEvent): Promise<void> {
    const listeners = [...this.listeners]

    const readonlyEvent = event as ReadonlyEvent<TEvent>

    for (const entry of listeners) {
      if (!this.matches(entry.eventName, event.subject)) {
        continue
      }

      if (entry.once) {
        this.removeEntry(entry)
      }

      try {
        await entry.listener(readonlyEvent)
      } catch (error) {
        await this.handleError({
          error,
          listenerEventName: entry.eventName,
          event: readonlyEvent
        })
      }
    }
  }

  private matches(listenerEventName: string, eventName: string): boolean {
    if (listenerEventName === eventName || listenerEventName === "*") {
      return true
    }

    if (!listenerEventName.endsWith(".*")) {
      return false
    }

    const namespace = listenerEventName.slice(0, -2)

    return eventName.startsWith(`${namespace}.`)
  }

  private async handleError(context: EventErrorContext<TEvent>): Promise<void> {
    try {
      await this.errorHandler?.(context)
    } catch {
      // emit() intentionally never rejects because of listener or error-handler failures.
    }
  }

  private removeEntry(entry: ListenerEntry<TEvent>): void {
    this.listeners = this.listeners.filter(
      (currentEntry) => currentEntry !== entry
    )
  }
}
