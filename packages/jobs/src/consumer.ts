import { connect } from "amqplib";

import { jobEventSchema, JobType } from "./contracts/jobs.js";

import type { JobEvent, JobEventFor, JobEventType } from "./contracts/jobs.js";
import type { Channel, ChannelModel, ConsumeMessage, Options, SocketOptions } from "amqplib";
import type { Logger } from "pino";

const INITIAL_RECOVERY_DELAY_MS = 100;
const MAX_RECOVERY_DELAY_MS = 30_000;
const DECLARED_JOB_TYPES = Object.values(JobType) as JobEventType[];

type RegisteredJobHandler = (event: JobEvent) => void | Promise<void>;

interface JobSubscription {
  channel: Channel;
  consumerTag: string;
  version: number;
}

/**
 * Configure RabbitMQ's consumer timeout above the longest expected handler
 * duration. This package does not send application heartbeats or acknowledge
 * a delivery before its handler settles.
 */
export interface JobConsumerOptions {
  connectionOptions: string | Options.Connect;
  queueName: string;
  logger: Logger;
  socketOptions?: SocketOptions;
}

/**
 * Handlers must be idempotent because a connection loss before acknowledgement
 * can cause RabbitMQ to deliver the job again.
 */
export type JobHandler<TType extends JobEventType = JobEventType> = (
  event: JobEventFor<TType>,
) => void | Promise<void>;

export interface JobConsumer {
  registerJobHandler<TType extends JobEventType>(type: TType, handler: JobHandler<TType>): void;
  start(): Promise<void>;
  /** First activation outcome after start(); later recovery does not change it. */
  waitForInitialActivation(): Promise<void>;
  stop(): Promise<void>;
}

function toError(error: unknown, fallbackMessage: string): Error {
  if (error instanceof Error) {
    return error;
  }

  return new Error(fallbackMessage, { cause: error });
}

export async function createJobConsumer(options: JobConsumerOptions): Promise<JobConsumer> {
  // Broker errors can embed credentials in arbitrary messages, stacks, or causes.
  // Lifecycle logs use only local reason labels, never raw transport errors.
  const logger = options.logger.child({ component: "job-consumer" });
  const handlers = new Map<JobEventType, RegisteredJobHandler>();

  let channel: Channel | undefined;
  let connection: ChannelModel | undefined;
  let subscription: JobSubscription | undefined;
  let subscriptionVersion = 0;
  let recoveryPromise: Promise<void> | undefined;
  let closePromise: Promise<void> | undefined;
  let lifetimePromise: Promise<void> | undefined;
  let resolveLifetime: (() => void) | undefined;
  let initialActivationPromise: Promise<void> | undefined;
  let resolveInitialActivation: (() => void) | undefined;
  let rejectInitialActivation: ((error: Error) => void) | undefined;
  let recoveryTimer: ReturnType<typeof setTimeout> | undefined;
  let recoveryDelay = INITIAL_RECOVERY_DELAY_MS;
  let recoveryInProgress = false;
  let processingTail = Promise.resolve();
  let activeHandler: Promise<void> | undefined;
  let started = false;
  let initialized = false;
  let closed = false;

  function failInitialActivation(message = "job consumer initial activation failed"): void {
    rejectInitialActivation?.(new Error(message));
  }

  async function closeQuietly(resource: { close(): Promise<void> } | undefined): Promise<void> {
    if (!resource) {
      return;
    }

    try {
      await resource.close();
    } catch {
      logger.warn({ queue: options.queueName }, "failed to close job consumer resource");
    }
  }

  async function cancelQuietly(currentSubscription: JobSubscription): Promise<void> {
    try {
      await currentSubscription.channel.cancel(currentSubscription.consumerTag);
    } catch {
      logger.warn(
        {
          consumerTag: currentSubscription.consumerTag,
          queue: options.queueName,
        },
        "failed to cancel job consumer subscription",
      );
    }
  }

  function stringProperty(value: unknown, property: string): string | undefined {
    if (typeof value !== "object" || value === null) {
      return undefined;
    }

    const propertyValue = (value as Record<string, unknown>)[property];
    return typeof propertyValue === "string" ? propertyValue : undefined;
  }

  function messageFields(
    message: ConsumeMessage,
    event?: JobEvent,
    payload?: unknown,
  ): Record<string, unknown> {
    const payloadJobId = stringProperty(payload, "id");
    const payloadType = stringProperty(payload, "type");
    const messageJobId =
      typeof message.properties.messageId === "string" ? message.properties.messageId : undefined;
    const messageType =
      typeof message.properties.type === "string" ? message.properties.type : undefined;

    return {
      consumerTag: message.fields.consumerTag,
      deliveryTag: message.fields.deliveryTag,
      exchange: message.fields.exchange,
      jobId: event?.id ?? payloadJobId ?? messageJobId,
      queue: options.queueName,
      redelivered: message.fields.redelivered,
      routingKey: message.fields.routingKey,
      type: event?.type ?? payloadType ?? messageType,
    };
  }

  function rejectFailedMessage(
    channelForMessage: Channel,
    message: ConsumeMessage,
    error: unknown,
    event?: JobEvent,
    payload?: unknown,
  ): void {
    const processingError = toError(error, "job processing failed");
    const fields = messageFields(message, event, payload);
    logger.error({ ...fields, err: processingError }, "failed to process job");

    if (channel !== channelForMessage) {
      return;
    }

    try {
      channelForMessage.reject(message, true);
    } catch (rejectError) {
      logger.error({ ...fields, err: rejectError }, "failed to reject job");
    }
  }

  function handleConnectionError(connectionWithError: ChannelModel): void {
    if (connection !== connectionWithError || closed) {
      return;
    }

    logger.error({ queue: options.queueName }, "job consumer connection error");
  }

  function handleConnectionClose(connectionThatClosed: ChannelModel): void {
    if (connection !== connectionThatClosed) {
      return;
    }

    connection = undefined;
    channel = undefined;
    subscription = undefined;
    failInitialActivation();

    if (initialized && !closed) {
      scheduleRecovery("connection_closed");
    }
  }

  function handleChannelError(channelWithError: Channel): void {
    if (channel !== channelWithError || closed) {
      return;
    }

    logger.error({ queue: options.queueName }, "job consumer channel error");
  }

  function handleChannelClose(channelThatClosed: Channel): void {
    if (channel !== channelThatClosed) {
      return;
    }

    channel = undefined;
    if (subscription?.channel === channelThatClosed) {
      subscription = undefined;
    }
    failInitialActivation();

    if (initialized && !closed) {
      scheduleRecovery("channel_closed");
    }
  }

  function handleSubscriptionCancellation(channelThatWasCancelled: Channel): void {
    if (channel !== channelThatWasCancelled || closed) {
      return;
    }

    subscriptionVersion += 1;
    failInitialActivation();
    if (subscription?.channel === channelThatWasCancelled) {
      subscription = undefined;
    }

    if (started && !closed) {
      scheduleRecovery("subscription_cancelled");
    }
  }

  function watchConnection(connectionToWatch: ChannelModel): void {
    connectionToWatch.on("error", () => handleConnectionError(connectionToWatch));
    connectionToWatch.on("close", () => handleConnectionClose(connectionToWatch));
  }

  function watchChannel(channelToWatch: Channel): void {
    channelToWatch.on("error", () => handleChannelError(channelToWatch));
    channelToWatch.on("close", () => handleChannelClose(channelToWatch));
    channelToWatch.on("cancel", () => handleSubscriptionCancellation(channelToWatch));
  }

  async function connectToBroker(): Promise<ChannelModel> {
    try {
      if (options.socketOptions) {
        return await connect(options.connectionOptions, options.socketOptions);
      }

      return await connect(options.connectionOptions);
    } catch (error) {
      const connectionError = toError(error, "job consumer connection failed");
      logger.error({ queue: options.queueName }, "failed to connect job consumer");
      throw connectionError;
    }
  }

  function scheduleRecovery(reason: string): void {
    if (closed || !initialized || recoveryTimer || recoveryInProgress) {
      return;
    }

    logger.warn(
      { reason, delayMs: recoveryDelay, queue: options.queueName },
      "job consumer unavailable; recovery scheduled",
    );

    const delay = recoveryDelay;
    recoveryDelay = Math.min(recoveryDelay * 2, MAX_RECOVERY_DELAY_MS);
    recoveryTimer = setTimeout(() => {
      recoveryTimer = undefined;
      startRecovery();
    }, delay);
  }

  async function createCheckedChannel(connectionToUse: ChannelModel): Promise<Channel> {
    const nextChannel = await connectionToUse.createChannel();
    watchChannel(nextChannel);

    try {
      if (closed || connection !== connectionToUse) {
        throw new Error("job consumer connection setup interrupted");
      }
      channel = nextChannel;
      await nextChannel.checkQueue(options.queueName);
      if (closed || connection !== connectionToUse || channel !== nextChannel) {
        throw new Error("job consumer queue check interrupted");
      }
    } catch (error) {
      failInitialActivation();
      if (channel === nextChannel) {
        channel = undefined;
      }
      await closeQuietly(nextChannel);
      throw toError(error, `job consumer queue ${options.queueName} is unavailable`);
    }

    return nextChannel;
  }

  function queueMessage(channelForMessage: Channel, message: ConsumeMessage): void {
    const next = processingTail.then(() => processMessage(channelForMessage, message));
    processingTail = next.catch(() => undefined);
    void next;
  }

  async function processMessage(
    channelForMessage: Channel,
    message: ConsumeMessage,
  ): Promise<void> {
    let event: JobEvent | undefined;
    let payload: unknown;

    try {
      payload = JSON.parse(message.content.toString("utf8")) as unknown;
      const parsedEvent = jobEventSchema.parse(payload);
      event = parsedEvent;

      const handler = handlers.get(parsedEvent.type);
      if (!handler) {
        throw new Error(`no job handler is registered for ${parsedEvent.type}`);
      }

      const handlerRun = Promise.resolve().then(() => handler(parsedEvent));
      activeHandler = handlerRun;
      try {
        await handlerRun;
      } finally {
        if (activeHandler === handlerRun) {
          activeHandler = undefined;
        }
      }

      if (channel === channelForMessage) {
        try {
          channelForMessage.ack(message);
        } catch (error) {
          logger.error(
            { ...messageFields(message, event), err: error },
            "failed to acknowledge job",
          );
          return;
        }
      }

      logger.info(messageFields(message, event), "job completed");
    } catch (error) {
      rejectFailedMessage(channelForMessage, message, error, event, payload);
    }
  }

  async function subscribe(
    connectionToUse: ChannelModel,
    nextChannel: Channel,
  ): Promise<JobSubscription> {
    const version = ++subscriptionVersion;
    let cancelled = false;

    try {
      await nextChannel.checkQueue(options.queueName);

      if (closed || connection !== connectionToUse || channel !== nextChannel) {
        throw new Error("job consumer subscription setup interrupted");
      }
      await nextChannel.prefetch(1);
      if (closed || connection !== connectionToUse || channel !== nextChannel) {
        throw new Error("job consumer subscription setup interrupted");
      }
      const result = await nextChannel.consume(
        options.queueName,
        (message) => {
          if (version !== subscriptionVersion) {
            return;
          }
          if (message === null) {
            cancelled = true;
            handleSubscriptionCancellation(nextChannel);
            return;
          }

          if (!closed && channel === nextChannel) {
            queueMessage(nextChannel, message);
          }
        },
        { noAck: false },
      );

      if (cancelled || version !== subscriptionVersion) {
        throw new Error("job consumer subscription was cancelled during setup");
      }

      return { channel: nextChannel, consumerTag: result.consumerTag, version };
    } catch (error) {
      failInitialActivation();
      if (channel === nextChannel) {
        channel = undefined;
      }
      await closeQuietly(nextChannel);
      throw error;
    }
  }

  async function recover(): Promise<void> {
    if (closed || !initialized || (channel && (!started || subscription)) || recoveryInProgress) {
      return;
    }

    recoveryInProgress = true;
    let recoveryConnection = connection;
    let ownsRecoveryConnection = false;

    try {
      if (!recoveryConnection) {
        recoveryConnection = await connectToBroker();
        ownsRecoveryConnection = true;
        connection = recoveryConnection;
        watchConnection(recoveryConnection);
      }

      if (closed) {
        if (ownsRecoveryConnection) {
          if (connection === recoveryConnection) {
            connection = undefined;
          }
          await closeQuietly(recoveryConnection);
        }
        return;
      }

      const checkedChannel = channel ?? (await createCheckedChannel(recoveryConnection));
      if (closed) {
        return;
      }
      if (connection !== recoveryConnection || channel !== checkedChannel) {
        throw new Error("job consumer recovery interrupted");
      }

      if (!started) {
        recoveryDelay = INITIAL_RECOVERY_DELAY_MS;
        logger.info({ queue: options.queueName }, "job consumer connection recovered");
        return;
      }

      const nextSubscription = await subscribe(recoveryConnection, checkedChannel);

      if (connection !== recoveryConnection || channel !== nextSubscription.channel) {
        failInitialActivation();
        await cancelQuietly(nextSubscription);
        await closeQuietly(nextSubscription.channel);
        return;
      }

      if (nextSubscription.version !== subscriptionVersion) {
        failInitialActivation();
        return;
      }

      subscription = nextSubscription;
      if (closed) {
        // stop() owns cancellation and draining, including deliveries during setup.
        return;
      }
      recoveryDelay = INITIAL_RECOVERY_DELAY_MS;

      if (recoveryTimer) {
        clearTimeout(recoveryTimer);
        recoveryTimer = undefined;
      }

      logger.info({ queue: options.queueName }, "job consumer subscribed");
      resolveInitialActivation?.();
    } catch {
      failInitialActivation();
      if (!closed) {
        logger.warn({ queue: options.queueName }, "job consumer recovery failed");
      }

      if (ownsRecoveryConnection && recoveryConnection) {
        if (connection === recoveryConnection) {
          connection = undefined;
        }
        await closeQuietly(recoveryConnection);
      }
    } finally {
      recoveryInProgress = false;
    }
  }

  function startRecovery(): void {
    if (recoveryPromise) {
      return;
    }

    const attempt = recover();
    recoveryPromise = attempt;
    void attempt.then(
      () => {
        if (recoveryPromise === attempt) {
          recoveryPromise = undefined;
          // Reconcile after the attempt settles: activation or loss may have
          // happened while it was pending, even after its last availability check.
          if (!channel || (started && !subscription)) {
            scheduleRecovery("recovery_incomplete");
          }
        }
      },
      () => {
        if (recoveryPromise === attempt) {
          recoveryPromise = undefined;
        }
      },
    );
  }

  const initialConnection = await connectToBroker();
  connection = initialConnection;
  watchConnection(initialConnection);

  try {
    const initialChannel = await createCheckedChannel(initialConnection);
    if (connection !== initialConnection || channel !== initialChannel) {
      await closeQuietly(initialChannel);
      throw new Error("job consumer initialization interrupted");
    }
    initialized = true;
  } catch (error) {
    channel = undefined;
    connection = undefined;
    await closeQuietly(initialConnection);
    throw error;
  }

  function registerJobHandler<TType extends JobEventType>(
    type: TType,
    handler: JobHandler<TType>,
  ): void {
    if (closed) {
      throw new Error("job consumer is stopped");
    }

    if (started) {
      throw new Error("job handler registration is closed after consumer start");
    }

    if (!DECLARED_JOB_TYPES.includes(type)) {
      throw new Error(`unknown job type ${type}`);
    }

    if (handlers.has(type)) {
      throw new Error(`a job handler is already registered for ${type}`);
    }

    handlers.set(type, handler as RegisteredJobHandler);
  }

  function start(): Promise<void> {
    if (closed) {
      return Promise.reject(new Error("job consumer is stopped"));
    }

    if (started) {
      return Promise.reject(new Error("job consumer has already started"));
    }

    const missingHandlers = DECLARED_JOB_TYPES.filter((type) => !handlers.has(type));
    if (missingHandlers.length > 0) {
      const error = new Error(`missing job handlers: ${missingHandlers.join(", ")}`);
      logger.error(
        { err: error, missingHandlers, queue: options.queueName },
        "failed to start job consumer",
      );
      return Promise.reject(error);
    }

    started = true;
    lifetimePromise = new Promise<void>((resolve) => {
      resolveLifetime = resolve;
    });
    initialActivationPromise = new Promise<void>((resolve, reject) => {
      resolveInitialActivation = resolve;
      rejectInitialActivation = reject;
    });
    // Lifetime-only callers retain recovery without an unobserved rejection.
    void initialActivationPromise.catch(() => undefined);
    startRecovery();
    return lifetimePromise;
  }

  function waitForInitialActivation(): Promise<void> {
    return initialActivationPromise ?? Promise.reject(new Error("job consumer has not started"));
  }

  async function stop(): Promise<void> {
    if (closePromise) {
      return closePromise;
    }

    closePromise = (async () => {
      closed = true;
      failInitialActivation("job consumer stopped before initial activation");

      if (recoveryTimer) {
        clearTimeout(recoveryTimer);
        recoveryTimer = undefined;
      }

      if (recoveryPromise) {
        await recoveryPromise;
      }

      const activeSubscription = subscription;
      subscription = undefined;
      if (activeSubscription) {
        await cancelQuietly(activeSubscription);
      }

      await processingTail;

      const activeChannel = channel;
      const activeConnection = connection;
      channel = undefined;
      connection = undefined;

      await closeQuietly(activeChannel);
      await closeQuietly(activeConnection);

      resolveLifetime?.();
      resolveLifetime = undefined;
    })();

    return closePromise;
  }

  return { registerJobHandler, start, waitForInitialActivation, stop };
}
