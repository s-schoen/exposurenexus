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
  stop(): Promise<void>;
}

function toError(error: unknown, fallbackMessage: string): Error {
  if (error instanceof Error) {
    return error;
  }

  return new Error(fallbackMessage, { cause: error });
}

export async function createJobConsumer(options: JobConsumerOptions): Promise<JobConsumer> {
  const logger = options.logger.child({ component: "job-consumer" });
  const handlers = new Map<JobEventType, RegisteredJobHandler>();

  let channel: Channel | undefined;
  let connection: ChannelModel | undefined;
  let subscription: JobSubscription | undefined;
  let recoveryPromise: Promise<void> | undefined;
  let closePromise: Promise<void> | undefined;
  let lifetimePromise: Promise<void> | undefined;
  let resolveLifetime: (() => void) | undefined;
  let recoveryTimer: ReturnType<typeof setTimeout> | undefined;
  let recoveryDelay = INITIAL_RECOVERY_DELAY_MS;
  let recoveryInProgress = false;
  let processingTail = Promise.resolve();
  let activeHandler: Promise<void> | undefined;
  let started = false;
  let closed = false;

  async function closeQuietly(resource: { close(): Promise<void> } | undefined): Promise<void> {
    if (!resource) {
      return;
    }

    try {
      await resource.close();
    } catch (error) {
      logger.warn(
        { err: error, queue: options.queueName },
        "failed to close job consumer resource",
      );
    }
  }

  async function cancelQuietly(currentSubscription: JobSubscription): Promise<void> {
    try {
      await currentSubscription.channel.cancel(currentSubscription.consumerTag);
    } catch (error) {
      logger.warn(
        {
          consumerTag: currentSubscription.consumerTag,
          err: error,
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

  function handleConnectionError(connectionWithError: ChannelModel, error: Error): void {
    if (connection !== connectionWithError || closed) {
      return;
    }

    logger.error({ err: error, queue: options.queueName }, "job consumer connection error");
  }

  function handleConnectionClose(connectionThatClosed: ChannelModel, error?: Error): void {
    if (connection !== connectionThatClosed) {
      return;
    }

    connection = undefined;
    channel = undefined;
    subscription = undefined;

    const reason = toError(error, "job consumer connection closed");
    if (started && !closed) {
      scheduleRecovery(reason);
    }
  }

  function handleChannelError(channelWithError: Channel, error: Error): void {
    if (channel !== channelWithError || closed) {
      return;
    }

    logger.error({ err: error, queue: options.queueName }, "job consumer channel error");
  }

  function handleChannelClose(channelThatClosed: Channel): void {
    if (channel !== channelThatClosed) {
      return;
    }

    channel = undefined;
    if (subscription?.channel === channelThatClosed) {
      subscription = undefined;
    }

    const reason = new Error("job consumer channel closed");
    if (started && !closed) {
      scheduleRecovery(reason);
    }
  }

  function handleSubscriptionCancellation(channelThatWasCancelled: Channel): void {
    if (subscription?.channel === channelThatWasCancelled) {
      subscription = undefined;
    }

    const reason = new Error("job consumer subscription cancelled by broker");
    if (started && !closed) {
      scheduleRecovery(reason);
    }
  }

  function watchConnection(connectionToWatch: ChannelModel): void {
    connectionToWatch.on("error", (error) => handleConnectionError(connectionToWatch, error));
    connectionToWatch.on("close", (error) => handleConnectionClose(connectionToWatch, error));
  }

  function watchChannel(channelToWatch: Channel): void {
    channelToWatch.on("error", (error) => handleChannelError(channelToWatch, error));
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
      logger.error(
        { err: connectionError, queue: options.queueName },
        "failed to connect job consumer",
      );
      throw connectionError;
    }
  }

  function scheduleRecovery(error: Error): void {
    if (closed || !started || recoveryTimer) {
      return;
    }

    logger.warn(
      { err: error, queue: options.queueName },
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
    channel = nextChannel;

    try {
      await nextChannel.checkQueue(options.queueName);
    } catch (error) {
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
    existingChannel?: Channel,
  ): Promise<JobSubscription> {
    const nextChannel = existingChannel ?? (await createCheckedChannel(connectionToUse));
    let cancelled = false;

    try {
      if (existingChannel) {
        await nextChannel.checkQueue(options.queueName);
      }

      await nextChannel.prefetch(1);
      const result = await nextChannel.consume(
        options.queueName,
        (message) => {
          if (message === null) {
            cancelled = true;
            handleSubscriptionCancellation(nextChannel);
            return;
          }

          if (!closed) {
            queueMessage(nextChannel, message);
          }
        },
        { noAck: false },
      );

      if (cancelled) {
        throw new Error("job consumer subscription was cancelled during setup");
      }

      return { channel: nextChannel, consumerTag: result.consumerTag };
    } catch (error) {
      if (channel === nextChannel) {
        channel = undefined;
      }
      await closeQuietly(nextChannel);
      throw error;
    }
  }

  async function recover(): Promise<void> {
    if (closed || !started || subscription || recoveryInProgress) {
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

      if (closed || !started) {
        if (ownsRecoveryConnection) {
          if (connection === recoveryConnection) {
            connection = undefined;
          }
          await closeQuietly(recoveryConnection);
        }
        return;
      }

      const nextSubscription = await subscribe(recoveryConnection, channel);

      if (
        closed ||
        !started ||
        connection !== recoveryConnection ||
        channel !== nextSubscription.channel
      ) {
        await cancelQuietly(nextSubscription);
        await closeQuietly(nextSubscription.channel);
        return;
      }

      subscription = nextSubscription;
      recoveryDelay = INITIAL_RECOVERY_DELAY_MS;

      if (recoveryTimer) {
        clearTimeout(recoveryTimer);
        recoveryTimer = undefined;
      }

      logger.info({ queue: options.queueName }, "job consumer subscribed");
    } catch (error) {
      const recoveryError = toError(error, "job consumer recovery failed");
      logger.warn({ err: recoveryError, queue: options.queueName }, "job consumer recovery failed");

      if (ownsRecoveryConnection && recoveryConnection) {
        if (connection === recoveryConnection) {
          connection = undefined;
        }
        await closeQuietly(recoveryConnection);
      }

      scheduleRecovery(recoveryError);
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
    await createCheckedChannel(initialConnection);
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
    startRecovery();
    return lifetimePromise;
  }

  async function stop(): Promise<void> {
    if (closePromise) {
      return closePromise;
    }

    closePromise = (async () => {
      closed = true;

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

  return { registerJobHandler, start, stop };
}
