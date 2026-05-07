export type EventListener<TPayload, TEventName extends string = string> = (
  payload: TPayload,
  eventName: TEventName
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
export type EventListenerName<TEventName extends string = string> =
  string extends TEventName
    ? string
    : TEventName | "*" | NamespaceWildcard<TEventName>

// Narrows the eventName argument passed into a listener callback based on the
// listener registration. A `user.*` listener only receives emitted event names
// below `user.`, while a `*` listener can receive any known event.
export type EmittedEventNameForListener<
  TEventName extends string,
  TListenerEventName extends EventListenerName<TEventName>
> = string extends TEventName
  ? string
  : TListenerEventName extends "*"
    ? TEventName
    : TListenerEventName extends `${infer Namespace}.*`
      ? Extract<TEventName, `${Namespace}.${string}`>
      : Extract<TEventName, TListenerEventName>

export type EventErrorContext<TPayload, TEventName extends string = string> = {
  error: unknown
  eventName: TEventName
  listenerEventName: EventListenerName<TEventName>
  payload: TPayload
}

export type EventErrorHandler<TPayload, TEventName extends string = string> = (
  context: EventErrorContext<TPayload, TEventName>
) => void | Promise<void>

type ListenerEntry<TPayload, TEventName extends string> = {
  eventName: EventListenerName<TEventName>
  listener: EventListener<TPayload, TEventName>
  once: boolean
}

/**
 * A small async event bus with typed payloads and namespace wildcard listeners.
 *
 * Listener names are derived from the event-name generic when it is a literal
 * union. Exact names match only themselves, `*` matches every emitted event, and
 * names ending in `.*` match every descendant event below that namespace. For
 * example, `user.*` matches `user.created` and `user.profile.updated`, but not
 * `user`. When the event-name generic is omitted, listener names remain plain
 * strings.
 *
 * Listeners run sequentially in registration order. Listener failures are passed
 * to the configured `onError` handler and never cause `emit` to reject.
 */
export class EventBus<TPayload, TEventName extends string = string> {
  private listeners: ListenerEntry<TPayload, TEventName>[] = []
  private errorHandler?: EventErrorHandler<TPayload, TEventName>

  /**
   * Registers a listener for an exact event name, `*`, or a namespace wildcard
   * such as `user.*`.
   *
   * @returns A function that removes this specific listener registration.
   */
  on<TListenerEventName extends EventListenerName<TEventName>>(
    eventName: TListenerEventName,
    listener: EventListener<
      TPayload,
      EmittedEventNameForListener<TEventName, TListenerEventName>
    >
  ): () => void {
    const entry = {
      eventName,
      listener: listener as EventListener<TPayload, TEventName>,
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
  once<TListenerEventName extends EventListenerName<TEventName>>(
    eventName: TListenerEventName,
    listener: EventListener<
      TPayload,
      EmittedEventNameForListener<TEventName, TListenerEventName>
    >
  ): () => void {
    const entry = {
      eventName,
      listener: listener as EventListener<TPayload, TEventName>,
      once: true
    }
    this.listeners.push(entry)

    return () => this.removeEntry(entry)
  }

  /**
   * Removes all registrations for the given listener function on the given
   * listener event name.
   */
  off<TListenerEventName extends EventListenerName<TEventName>>(
    eventName: TListenerEventName,
    listener: EventListener<
      TPayload,
      EmittedEventNameForListener<TEventName, TListenerEventName>
    >
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
  onError(handler: EventErrorHandler<TPayload, TEventName>): () => void {
    this.errorHandler = handler

    return () => {
      if (this.errorHandler === handler) {
        this.errorHandler = undefined
      }
    }
  }

  /**
   * Emits an event with a typed payload.
   *
   * Matching listeners are awaited sequentially in registration order. If a
   * listener throws or rejects, the error handler is awaited and emission then
   * continues with later listeners. This method always resolves successfully.
   */
  async emit(eventName: TEventName, payload: TPayload): Promise<void> {
    const listeners = [...this.listeners]

    for (const entry of listeners) {
      if (!this.matches(entry.eventName, eventName)) {
        continue
      }

      if (entry.once) {
        this.removeEntry(entry)
      }

      try {
        await entry.listener(payload, eventName)
      } catch (error) {
        await this.handleError({
          error,
          eventName,
          listenerEventName: entry.eventName,
          payload
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

  private async handleError(
    context: EventErrorContext<TPayload, TEventName>
  ): Promise<void> {
    try {
      await this.errorHandler?.(context)
    } catch {
      // emit() intentionally never rejects because of listener or error-handler failures.
    }
  }

  private removeEntry(entry: ListenerEntry<TPayload, TEventName>): void {
    this.listeners = this.listeners.filter(
      (currentEntry) => currentEntry !== entry
    )
  }
}
