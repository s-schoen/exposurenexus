import { connect } from "amqplib";

import { createJobEvent } from "./contracts/jobs.js";

import type { JobDataFor, JobEvent, JobEventFor, JobEventType } from "./contracts/jobs.js";
import type { ChannelModel, ConfirmChannel, Message, Options, SocketOptions } from "amqplib";
import type { Logger } from "pino";

const INITIAL_RECOVERY_DELAY_MS = 100;
const MAX_RECOVERY_DELAY_MS = 30_000;

interface PendingPublish {
  channel: ConfirmChannel;
  event: JobEvent;
  reject: (error: Error) => void;
  resolve: () => void;
}

export interface JobProducerOptions {
  connectionOptions: string | Options.Connect;
  exchangeName: string;
  logger: Logger;
  socketOptions?: SocketOptions;
}

export interface JobProducer {
  enqueue<TType extends JobEventType>(
    type: TType,
    data: JobDataFor<TType>,
  ): Promise<JobEventFor<TType>>;
  close(): Promise<void>;
}

function toError(error: unknown, fallbackMessage: string): Error {
  if (error instanceof Error) {
    return error;
  }

  return new Error(fallbackMessage, { cause: error });
}

export async function createJobProducer(options: JobProducerOptions): Promise<JobProducer> {
  const logger = options.logger.child({ component: "job-producer" });
  const pendingPublishes = new Map<string, PendingPublish>();

  let channel: ConfirmChannel | undefined;
  let connection: ChannelModel | undefined;
  let recoveryPromise: Promise<void> | undefined;
  let closePromise: Promise<void> | undefined;
  let recoveryTimer: ReturnType<typeof setTimeout> | undefined;
  let recoveryDelay = INITIAL_RECOVERY_DELAY_MS;
  let recoveryInProgress = false;
  let established = false;
  let ready = false;
  let closed = false;
  let backpressuredChannel: ConfirmChannel | undefined;

  async function closeQuietly(resource: { close(): Promise<void> } | undefined): Promise<void> {
    if (!resource) {
      return;
    }

    try {
      await resource.close();
    } catch (error) {
      logger.warn({ err: error }, "failed to close job producer resource");
    }
  }

  function settlePublish(jobID: string, error?: unknown): void {
    const pending = pendingPublishes.get(jobID);
    if (!pending) {
      return;
    }

    pendingPublishes.delete(jobID);

    if (error) {
      const publishError = toError(error, `job ${jobID} could not be published`);
      logger.error(
        {
          err: publishError,
          exchange: options.exchangeName,
          jobId: pending.event.id,
          type: pending.event.type,
        },
        "failed to enqueue job",
      );
      pending.reject(publishError);
      return;
    }

    logger.info(
      {
        exchange: options.exchangeName,
        jobId: pending.event.id,
        type: pending.event.type,
      },
      "job enqueued",
    );
    pending.resolve();
  }

  function rejectPendingPublishes(error: unknown, pendingChannel?: ConfirmChannel): void {
    for (const [jobID, pending] of pendingPublishes) {
      if (!pendingChannel || pending.channel === pendingChannel) {
        settlePublish(jobID, error);
      }
    }
  }

  function scheduleRecovery(error: Error): void {
    if (closed || recoveryTimer) {
      return;
    }

    logger.warn(
      { err: error, exchange: options.exchangeName },
      "job producer unavailable; recovery scheduled",
    );

    const delay = recoveryDelay;
    recoveryDelay = Math.min(recoveryDelay * 2, MAX_RECOVERY_DELAY_MS);
    recoveryTimer = setTimeout(() => {
      recoveryTimer = undefined;
      startRecovery();
    }, delay);
    recoveryTimer.unref?.();
  }

  function handleConnectionError(connectionWithError: ChannelModel, error: Error): void {
    if (closed || connection !== connectionWithError) {
      return;
    }

    logger.error({ err: error, exchange: options.exchangeName }, "job producer connection error");
  }

  function handleConnectionClose(connectionThatClosed: ChannelModel, error?: Error): void {
    if (connection !== connectionThatClosed) {
      return;
    }

    connection = undefined;
    ready = false;

    const closedChannel = channel;
    channel = undefined;
    backpressuredChannel = undefined;

    const reason = toError(error, "job producer connection closed");
    if (closedChannel) {
      rejectPendingPublishes(reason, closedChannel);
    }

    if (established && !closed) {
      scheduleRecovery(reason);
    }
  }

  function handleChannelError(channelWithError: ConfirmChannel, error: Error): void {
    logger.error(
      {
        err: error,
        exchange: options.exchangeName,
        ready: channel === channelWithError,
      },
      "job producer channel error",
    );
  }

  function handleChannelClose(channelThatClosed: ConfirmChannel): void {
    if (channel !== channelThatClosed) {
      return;
    }

    channel = undefined;
    ready = false;
    backpressuredChannel = undefined;

    const reason = new Error("job producer channel closed");
    rejectPendingPublishes(reason, channelThatClosed);

    if (established && !closed) {
      scheduleRecovery(reason);
    }
  }

  function handleReturnedMessage(channelThatReturned: ConfirmChannel, message: Message): void {
    let pending: PendingPublish | undefined;
    const messageID = message.properties?.messageId;

    if (typeof messageID === "string") {
      const matchingPending = pendingPublishes.get(messageID);
      if (matchingPending?.channel === channelThatReturned) {
        pending = matchingPending;
      }
    }

    if (!pending) {
      pending = [...pendingPublishes.values()].find(
        (candidate) => candidate.channel === channelThatReturned,
      );
    }

    if (!pending) {
      return;
    }

    settlePublish(
      pending.event.id,
      new Error(`job ${pending.event.id} was returned because it was not routed`),
    );
  }

  function watchConnection(connectionToWatch: ChannelModel): void {
    connectionToWatch.on("error", (error) => handleConnectionError(connectionToWatch, error));
    connectionToWatch.on("close", (error) => handleConnectionClose(connectionToWatch, error));
  }

  function watchChannel(channelToWatch: ConfirmChannel): void {
    channelToWatch.on("error", (error) => handleChannelError(channelToWatch, error));
    channelToWatch.on("close", () => handleChannelClose(channelToWatch));
    channelToWatch.on("drain", () => {
      if (backpressuredChannel === channelToWatch) {
        backpressuredChannel = undefined;
      }
    });
    channelToWatch.on("return", (message) => handleReturnedMessage(channelToWatch, message));
  }

  async function connectToBroker(): Promise<ChannelModel> {
    try {
      if (options.socketOptions) {
        return await connect(options.connectionOptions, options.socketOptions);
      }

      return await connect(options.connectionOptions);
    } catch (error) {
      const connectionError = toError(error, "job producer connection failed");
      logger.error(
        { err: connectionError, exchange: options.exchangeName },
        "failed to connect job producer",
      );
      throw connectionError;
    }
  }

  async function createCheckedChannel(connectionToUse: ChannelModel): Promise<ConfirmChannel> {
    const nextChannel = await connectionToUse.createConfirmChannel();
    watchChannel(nextChannel);

    try {
      await nextChannel.checkExchange(options.exchangeName);
    } catch (error) {
      await closeQuietly(nextChannel);
      throw toError(error, `job producer exchange ${options.exchangeName} is unavailable`);
    }

    return nextChannel;
  }

  async function recover(): Promise<void> {
    if (closed || ready || recoveryInProgress) {
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

      const nextChannel = await createCheckedChannel(recoveryConnection);

      if (closed) {
        await closeQuietly(nextChannel);
        if (ownsRecoveryConnection) {
          if (connection === recoveryConnection) {
            connection = undefined;
          }
          await closeQuietly(recoveryConnection);
        }
        return;
      }

      channel = nextChannel;
      ready = true;
      recoveryDelay = INITIAL_RECOVERY_DELAY_MS;

      if (recoveryTimer) {
        clearTimeout(recoveryTimer);
        recoveryTimer = undefined;
      }

      logger.info({ exchange: options.exchangeName }, "job producer recovered");
    } catch (error) {
      const recoveryError = toError(error, "job producer recovery failed");
      logger.warn(
        { err: recoveryError, exchange: options.exchangeName },
        "job producer recovery failed",
      );

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
    channel = await createCheckedChannel(initialConnection);
    ready = true;
    established = true;
  } catch (error) {
    connection = undefined;
    await closeQuietly(initialConnection);
    throw error;
  }

  async function enqueue<TType extends JobEventType>(
    type: TType,
    data: JobDataFor<TType>,
  ): Promise<JobEventFor<TType>> {
    let event: JobEventFor<TType>;

    try {
      event = createJobEvent({ type, data });
    } catch (error) {
      logger.error({ err: error, type }, "failed to enqueue job");
      throw error;
    }

    const publishChannel = channel;
    if (!ready || !publishChannel) {
      const error = new Error("job producer is not connected");
      logger.error({ err: error, jobId: event.id, type: event.type }, "failed to enqueue job");
      throw error;
    }

    if (backpressuredChannel === publishChannel) {
      const error = new Error("job producer publish buffer is full");
      logger.error({ err: error, jobId: event.id, type: event.type }, "failed to enqueue job");
      throw error;
    }

    const content = Buffer.from(JSON.stringify(event), "utf8");
    const publishOptions: Options.Publish = {
      contentType: event.datacontenttype,
      mandatory: true,
      messageId: event.id,
      persistent: true,
      timestamp: Date.parse(event.time),
      type: event.type,
    };

    return new Promise<JobEventFor<TType>>((resolve, reject) => {
      pendingPublishes.set(event.id, {
        channel: publishChannel,
        event,
        reject,
        resolve: () => resolve(event),
      });

      try {
        const writable = publishChannel.publish(
          options.exchangeName,
          event.type,
          content,
          publishOptions,
          (error) => {
            if (error) {
              settlePublish(event.id, error);
            } else {
              settlePublish(event.id);
            }
          },
        );
        if (!writable) {
          backpressuredChannel = publishChannel;
        }
      } catch (error) {
        settlePublish(event.id, error);
      }
    });
  }

  async function close(): Promise<void> {
    if (closePromise) {
      return closePromise;
    }

    closePromise = (async () => {
      closed = true;
      ready = false;

      if (recoveryTimer) {
        clearTimeout(recoveryTimer);
        recoveryTimer = undefined;
      }

      if (recoveryPromise) {
        try {
          await recoveryPromise;
        } catch (error) {
          logger.error({ err: error }, "job producer recovery stopped during close");
        }
      }

      const activeChannel = channel;
      const activeConnection = connection;
      channel = undefined;
      connection = undefined;
      backpressuredChannel = undefined;

      if (activeChannel) {
        try {
          await activeChannel.waitForConfirms();
          for (const [jobID, pending] of pendingPublishes) {
            if (pending.channel === activeChannel) {
              settlePublish(jobID);
            }
          }
        } catch (error) {
          rejectPendingPublishes(error, activeChannel);
        }

        await closeQuietly(activeChannel);
      }

      rejectPendingPublishes(new Error("job producer is closed"));
      await closeQuietly(activeConnection);
    })();

    return closePromise;
  }

  return { close, enqueue };
}
