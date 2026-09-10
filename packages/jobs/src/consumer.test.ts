import { EventEmitter } from "node:events";
import { inspect } from "node:util";

import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import { createJobConsumer } from "./consumer.js";
import * as contracts from "./index.js";
import { createJobEvent, JobType } from "./index.js";

import type { JobConsumerOptions, JobHandler } from "./consumer.js";
import type { Channel, ConsumeMessage } from "amqplib";
import type { Logger } from "pino";

const { connectMock } = vi.hoisted(() => ({
  connectMock: vi.fn(),
}));

vi.mock("amqplib", () => ({
  connect: connectMock,
}));

const QUEUE_NAME = "EXPOSURENEXUS_JOBS_INGEST";
const CONNECTION_URL = "amqp://127.0.0.1:5672";
const ingestionData = {
  userid: "550e8400-e29b-41d4-a716-446655440000",
  ingestdataurl: "https://example.com/ingest.json",
  format: "json",
};

type FakeChannel = EventEmitter & {
  ack: ReturnType<typeof vi.fn>;
  assertQueue: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
  checkQueue: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  consume: ReturnType<typeof vi.fn<Channel["consume"]>>;
  emitMessage: (message: ConsumeMessage | null) => void;
  nack: ReturnType<typeof vi.fn>;
  prefetch: ReturnType<typeof vi.fn>;
  reject: ReturnType<typeof vi.fn>;
};

type FakeConnection = EventEmitter & {
  close: ReturnType<typeof vi.fn>;
  createChannel: ReturnType<typeof vi.fn>;
};

function createFakeChannel(): FakeChannel {
  const channel = new EventEmitter() as FakeChannel;
  let messageHandler: ((message: ConsumeMessage | null) => void) | undefined;

  channel.ack = vi.fn();
  channel.assertQueue = vi.fn();
  channel.cancel = vi.fn().mockResolvedValue({});
  channel.checkQueue = vi.fn().mockResolvedValue({});
  channel.close = vi.fn().mockResolvedValue(undefined);
  channel.consume = vi.fn().mockImplementation((_queue, handler) => {
    messageHandler = handler;
    return Promise.resolve({ consumerTag: "consumer-tag" });
  });
  channel.emitMessage = (message) => messageHandler?.(message);
  channel.nack = vi.fn();
  channel.prefetch = vi.fn().mockResolvedValue({});
  channel.reject = vi.fn();
  return channel;
}

function createFakeConnection(channels: FakeChannel[]): FakeConnection {
  const connection = new EventEmitter() as FakeConnection;
  connection.close = vi.fn().mockResolvedValue(undefined);
  connection.createChannel = vi.fn().mockImplementation(() => {
    const nextChannel = channels.shift();
    if (!nextChannel) {
      return Promise.reject(new Error("no fake channel available"));
    }
    return Promise.resolve(nextChannel);
  });
  return connection;
}

function createLogger(): { childLogger: Logger; logger: Logger; child: ReturnType<typeof vi.fn> } {
  const childLogger = {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  } as unknown as Logger;
  const child = vi.fn(() => childLogger);
  const logger = { child } as unknown as Logger;
  return { childLogger, logger, child };
}

function createOptions(logger: Logger): JobConsumerOptions {
  return {
    connectionOptions: CONNECTION_URL,
    logger,
    queueName: QUEUE_NAME,
    socketOptions: { noDelay: true },
  };
}

function createRawMessage(
  content: string,
  deliveryTag: number,
  routingKey: string,
  properties: Record<string, unknown> = {},
): ConsumeMessage {
  return {
    content: Buffer.from(content, "utf8"),
    fields: {
      consumerTag: "consumer-tag",
      deliveryTag,
      exchange: "EXPOSURENEXUS_JOBS",
      redelivered: false,
      routingKey,
    },
    properties: properties as unknown as ConsumeMessage["properties"],
  } as ConsumeMessage;
}

function createMessage(event: ReturnType<typeof createJobEvent>, deliveryTag = 1): ConsumeMessage {
  return createRawMessage(JSON.stringify(event), deliveryTag, event.type, {
    messageId: event.id,
    type: event.type,
  });
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

describe("createJobConsumer", () => {
  let channel: FakeChannel;
  let connection: FakeConnection;
  let logger: Logger;
  let childLogger: Logger;
  let child: ReturnType<typeof vi.fn>;
  let options: JobConsumerOptions;

  beforeEach(() => {
    vi.clearAllMocks();
    channel = createFakeChannel();
    connection = createFakeConnection([channel]);
    connectMock.mockResolvedValue(connection);
    ({ childLogger, logger, child } = createLogger());
    options = createOptions(logger);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps consumer exports out of the contracts-only root entry point", () => {
    expect(contracts).not.toHaveProperty("createJobConsumer");
    expect(contracts).not.toHaveProperty("JobConsumer");
    expect(contracts).not.toHaveProperty("JobConsumerOptions");
    expect(contracts).not.toHaveProperty("JobHandler");
  });

  it("connects with supplied options and passively checks the queue", async () => {
    const consumer = await createJobConsumer(options);

    expect(connectMock).toHaveBeenCalledWith(options.connectionOptions, options.socketOptions);
    expect(child).toHaveBeenCalledWith({ component: "job-consumer" });
    expect(connection.createChannel).toHaveBeenCalledOnce();
    expect(channel.checkQueue).toHaveBeenCalledWith(QUEUE_NAME);
    expect(channel.assertQueue).not.toHaveBeenCalled();

    await consumer.stop();
  });

  it("rejects unavailable connections and queues without changing topology", async () => {
    const connectionError = new Error("connection failed");
    connectMock.mockRejectedValueOnce(connectionError);
    await expect(createJobConsumer(options)).rejects.toBe(connectionError);

    const missingQueueChannel = createFakeChannel();
    const missingQueueConnection = createFakeConnection([missingQueueChannel]);
    const missingQueueError = new Error("queue not found");
    missingQueueChannel.checkQueue.mockRejectedValueOnce(missingQueueError);
    connectMock.mockResolvedValueOnce(missingQueueConnection);

    await expect(createJobConsumer(options)).rejects.toBe(missingQueueError);
    expect(missingQueueChannel.assertQueue).not.toHaveBeenCalled();
    expect(missingQueueChannel.close).toHaveBeenCalledOnce();
    expect(missingQueueConnection.close).toHaveBeenCalledOnce();

    const channelError = new Error("channel creation failed");
    connection.createChannel.mockRejectedValueOnce(channelError);
    await expect(createJobConsumer(options)).rejects.toBe(channelError);
    expect(connection.close).toHaveBeenCalledOnce();
  });

  it.each(["connection", "channel"])("recovers an idle %s without consuming", async (resource) => {
    vi.useFakeTimers();
    const restored = createFakeChannel();
    const restoredConnection = createFakeConnection([restored]);
    const consumer = await createJobConsumer(options);
    connectMock.mockResolvedValueOnce(restoredConnection);
    connection.createChannel.mockResolvedValueOnce(restored);

    (resource === "connection" ? connection : channel).emit("close");
    await vi.advanceTimersByTimeAsync(100);

    expect(restored.checkQueue).toHaveBeenCalledWith(QUEUE_NAME);
    for (const checked of [channel, restored]) {
      expect(checked.prefetch).not.toHaveBeenCalled();
      expect(checked.consume).not.toHaveBeenCalled();
      expect(checked.ack).not.toHaveBeenCalled();
      expect(checked.reject).not.toHaveBeenCalled();
    }
    expect(childLogger.info).toHaveBeenCalledWith(
      { queue: QUEUE_NAME },
      "job consumer connection recovered",
    );
    await consumer.stop();
    await consumer.stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(restored.close).toHaveBeenCalledOnce();
  });

  it("correlates handler types with full job events", async () => {
    const consumer = await createJobConsumer(options);
    const handler: JobHandler<JobType.INGESTION> = async (event) => {
      expectTypeOf(event).toEqualTypeOf<contracts.JobEventFor<JobType.INGESTION>>();
      expect(event.data.format).toBe("json");
    };

    consumer.registerJobHandler(JobType.INGESTION, handler);
    const running = consumer.start();
    await flush();
    await consumer.stop();
    await running;
  });

  it("reports initial activation only after consume succeeds without settling the lifetime", async () => {
    vi.useFakeTimers();
    const consumer = await createJobConsumer(options);
    const subscribing = deferred<{ consumerTag: string }>();
    channel.consume.mockReturnValueOnce(subscribing.promise);
    consumer.registerJobHandler(JobType.INGESTION, vi.fn());
    const lifetimeSettled = vi.fn();
    const running = consumer.start().then(lifetimeSettled);
    const ready = consumer.waitForInitialActivation();
    const activated = vi.fn();
    void ready.then(activated);
    expect(consumer.waitForInitialActivation()).toBe(ready);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(activated).not.toHaveBeenCalled();
    subscribing.resolve({ consumerTag: "initial" });
    await ready;
    expect(lifetimeSettled).not.toHaveBeenCalled();
    await consumer.stop();
    await running;
    expect(lifetimeSettled).toHaveBeenCalledOnce();
  });

  it.each(["checkQueue", "prefetch", "consume"] as const)(
    "reports initial %s failure but preserves lifetime-only recovery",
    async (phase) => {
      vi.useFakeTimers();
      const consumer = await createJobConsumer(options);
      const restored = createFakeChannel();
      connection.createChannel.mockResolvedValueOnce(restored);
      channel[phase].mockRejectedValueOnce(new Error("amqp://user:secret@host"));
      consumer.registerJobHandler(JobType.INGESTION, vi.fn());
      const lifetimeSettled = vi.fn();
      const running = consumer.start().then(lifetimeSettled);
      await expect(consumer.waitForInitialActivation()).rejects.toThrow(
        "job consumer initial activation failed",
      );
      await vi.advanceTimersByTimeAsync(1000);
      expect(restored.consume).toHaveBeenCalledOnce();
      expect(lifetimeSettled).not.toHaveBeenCalled();
      await expect(consumer.waitForInitialActivation()).rejects.toThrow(
        "job consumer initial activation failed",
      );
      await consumer.stop();
      await running;
    },
  );

  it("reports initial failure before pending failed-channel cleanup completes", async () => {
    const consumer = await createJobConsumer(options);
    const closing = deferred();
    channel.prefetch.mockRejectedValueOnce(new Error("secret"));
    channel.close.mockReturnValueOnce(closing.promise);
    consumer.registerJobHandler(JobType.INGESTION, vi.fn());
    const running = consumer.start();
    await expect(consumer.waitForInitialActivation()).rejects.toThrow(
      "job consumer initial activation failed",
    );
    const stopping = consumer.stop();
    closing.resolve();
    await stopping;
    await running;
  });

  it.each(["connect", "createChannel"])(
    "reports %s failure when activating an unavailable idle consumer",
    async (phase) => {
      vi.useFakeTimers();
      const consumer = await createJobConsumer(options);
      if (phase === "connect") {
        connection.emit("close");
        connectMock.mockRejectedValueOnce(new Error("secret"));
      } else {
        channel.emit("close");
        connection.createChannel.mockRejectedValueOnce(new Error("secret"));
      }
      consumer.registerJobHandler(JobType.INGESTION, vi.fn());
      const running = consumer.start();
      await expect(consumer.waitForInitialActivation()).rejects.toThrow(
        "job consumer initial activation failed",
      );
      await consumer.stop();
      await running;
      expect(channel.consume).not.toHaveBeenCalled();
    },
  );

  it("does not invalidate successful initial activation during later failed recovery", async () => {
    vi.useFakeTimers();
    const consumer = await createJobConsumer(options);
    consumer.registerJobHandler(JobType.INGESTION, vi.fn());
    const running = consumer.start();
    await consumer.waitForInitialActivation();
    const restored = createFakeChannel();
    connectMock
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(createFakeConnection([restored]));
    connection.emit("close");
    await vi.advanceTimersByTimeAsync(100);
    await expect(consumer.waitForInitialActivation()).resolves.toBeUndefined();
    expect(restored.consume).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    expect(restored.consume).toHaveBeenCalledOnce();
    await consumer.stop();
    await running;
  });

  it("rejects readiness on stop without waiting for a pending consume response", async () => {
    vi.useFakeTimers();
    const consumer = await createJobConsumer(options);
    const subscribing = deferred<{ consumerTag: string }>();
    channel.consume.mockReturnValueOnce(subscribing.promise);
    consumer.registerJobHandler(JobType.INGESTION, vi.fn());
    const running = consumer.start();
    await vi.advanceTimersByTimeAsync(0);
    const stopping = consumer.stop();
    await expect(consumer.waitForInitialActivation()).rejects.toThrow(
      "stopped before initial activation",
    );
    subscribing.resolve({ consumerTag: "late" });
    await stopping;
    await running;
    expect(channel.cancel).toHaveBeenCalledWith("late");
  });

  it.each(["connection", "channel", "cancellation"])(
    "rejects activation interrupted by %s loss even if consume is pending",
    async (resource) => {
      vi.useFakeTimers();
      const consumer = await createJobConsumer(options);
      const subscribing = deferred<{ consumerTag: string }>();
      channel.consume.mockReturnValueOnce(subscribing.promise);
      consumer.registerJobHandler(JobType.INGESTION, vi.fn());
      const running = consumer.start();
      const outcome = consumer.waitForInitialActivation().catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(0);
      if (resource === "cancellation") channel.emit("cancel");
      else (resource === "connection" ? connection : channel).emit("close");
      expect(await outcome).toMatchObject({ message: "job consumer initial activation failed" });
      const stopping = consumer.stop();
      subscribing.resolve({ consumerTag: "late" });
      await stopping;
      await running;
    },
  );

  it("rejects readiness before start without preventing later activation", async () => {
    const consumer = await createJobConsumer(options);
    await expect(consumer.waitForInitialActivation()).rejects.toThrow("has not started");
    await expect(consumer.start()).rejects.toThrow("missing job handlers");
    await expect(consumer.waitForInitialActivation()).rejects.toThrow("has not started");
    consumer.registerJobHandler(JobType.INGESTION, vi.fn());
    const running = consumer.start();
    await consumer.waitForInitialActivation();
    await consumer.stop();
    await running;
    await expect(consumer.waitForInitialActivation()).resolves.toBeUndefined();
  });

  it.each(["connection", "channel"])(
    "rejects initialization interrupted during queue check by %s loss",
    async (resource) => {
      vi.useFakeTimers();
      const check = deferred();
      channel.checkQueue.mockReturnValueOnce(check.promise);
      const creating = createJobConsumer(options);
      const outcome = creating.catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(0);
      (resource === "connection" ? connection : channel).emit("close");
      check.resolve();
      expect(await outcome).toMatchObject({ message: expect.stringContaining("interrupted") });
      await vi.advanceTimersByTimeAsync(60_000);
      expect(channel.close).toHaveBeenCalledOnce();
      expect(connection.close).toHaveBeenCalledOnce();
      expect(connectMock).toHaveBeenCalledOnce();
    },
  );

  it("activates during an idle recovery queue check and preserves the consuming lifetime", async () => {
    vi.useFakeTimers();
    const restored = createFakeChannel();
    const check = deferred();
    restored.checkQueue.mockReturnValueOnce(check.promise);
    const consumer = await createJobConsumer(options);
    connection.createChannel.mockResolvedValueOnce(restored);
    channel.emit("close");
    await vi.advanceTimersByTimeAsync(100);
    const handler = vi.fn();
    consumer.registerJobHandler(JobType.INGESTION, handler);
    const settled = vi.fn();
    const running = consumer.start().then(settled);
    check.resolve();
    await vi.advanceTimersByTimeAsync(1000);
    expect(restored.consume).toHaveBeenCalledOnce();
    expect(restored.prefetch).toHaveBeenCalledWith(1);
    await expect(consumer.waitForInitialActivation()).resolves.toBeUndefined();
    restored.emitMessage(
      createMessage(createJobEvent({ type: JobType.INGESTION, data: ingestionData })),
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(handler).toHaveBeenCalledOnce();
    expect(restored.ack).toHaveBeenCalledOnce();
    expect(settled).not.toHaveBeenCalled();
    await expect(consumer.start()).rejects.toThrow("already started");
    await consumer.stop();
    await running;
    expect(settled).toHaveBeenCalledOnce();
  });

  it("rejects duplicate and late handler registrations and lists missing handlers", async () => {
    const consumer = await createJobConsumer(options);
    const handler: JobHandler<JobType.INGESTION> = vi.fn();

    await expect(consumer.start()).rejects.toThrow(
      "missing job handlers: exposurenexus.jobs.ingest",
    );
    consumer.registerJobHandler(JobType.INGESTION, handler);
    expect(() => consumer.registerJobHandler(JobType.INGESTION, handler)).toThrow(
      "already registered",
    );

    const running = consumer.start();
    expect(() => consumer.registerJobHandler(JobType.INGESTION, handler)).toThrow("registration");
    await consumer.stop();
    await running;
  });

  it.each(["connect", "createChannel", "checkQueue", "prefetch", "consume"])(
    "stops safely during pending %s",
    async (phase) => {
      vi.useFakeTimers();
      const consumer = await createJobConsumer(options);
      const handling = deferred();
      const handler = vi.fn(() => handling.promise);
      consumer.registerJobHandler(JobType.INGESTION, handler);
      const running = consumer.start();
      await vi.advanceTimersByTimeAsync(0);

      const restored = createFakeChannel();
      const restoredConnection = createFakeConnection([restored]);
      const pending = deferred();
      connectMock.mockResolvedValueOnce(restoredConnection);
      if (phase === "connect") {
        connectMock.mockReset().mockReturnValueOnce(pending.promise.then(() => restoredConnection));
      } else if (phase === "createChannel") {
        restoredConnection.createChannel.mockReturnValueOnce(pending.promise.then(() => restored));
      } else if (phase === "consume") {
        const consume = restored.consume;
        restored.consume = vi.fn((...args) => {
          void consume(...args);
          return pending.promise.then(() => ({ consumerTag: "consumer-tag" }));
        });
      } else {
        restored[phase as "checkQueue" | "prefetch"].mockReturnValueOnce(pending.promise);
      }
      connection.emit("close");
      await vi.advanceTimersByTimeAsync(100);
      if (phase === "consume") {
        restored.emitMessage(
          createMessage(createJobEvent({ type: JobType.INGESTION, data: ingestionData })),
        );
        await vi.advanceTimersByTimeAsync(0);
        expect(handler).toHaveBeenCalledOnce();
      }

      const stopping = consumer.stop();
      const stoppingAgain = consumer.stop();
      pending.resolve();
      await vi.advanceTimersByTimeAsync(0);
      if (phase === "consume") {
        expect(restored.cancel).toHaveBeenCalledOnce();
        expect(restored.close).not.toHaveBeenCalled();
      } else {
        expect(restored.consume).not.toHaveBeenCalled();
      }
      handling.resolve();
      await Promise.all([stopping, stoppingAgain, running]);
      expect(restoredConnection.close).toHaveBeenCalledOnce();
      if (phase !== "connect") {
        expect(restored.close).toHaveBeenCalledOnce();
      }
      if (phase === "consume") {
        expect(restored.ack).toHaveBeenCalledOnce();
      }
      await vi.advanceTimersByTimeAsync(60_000);
      expect(vi.getTimerCount()).toBe(0);
      await expect(consumer.start()).rejects.toThrow("stopped");
    },
  );

  it("does not lose retries when a queue check outlasts a recovery timer", async () => {
    vi.useFakeTimers();
    const consumer = await createJobConsumer(options);
    const interrupted = createFakeChannel();
    const restored = createFakeChannel();
    const check = deferred();
    interrupted.checkQueue.mockReturnValueOnce(check.promise);
    connection.createChannel.mockResolvedValueOnce(interrupted).mockResolvedValueOnce(restored);
    channel.emit("close");
    await vi.advanceTimersByTimeAsync(100);
    interrupted.emit("close");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(connection.createChannel).toHaveBeenCalledTimes(2);
    check.resolve();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(restored.checkQueue).toHaveBeenCalledOnce();
    expect(restored.consume).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    await consumer.stop();
  });

  it("does not overlap or lose recovery when activation coincides with a scheduled retry", async () => {
    vi.useFakeTimers();
    const consumer = await createJobConsumer(options);
    const pending = deferred<FakeConnection>();
    connectMock.mockReturnValueOnce(pending.promise);
    connection.emit("close");
    consumer.registerJobHandler(JobType.INGESTION, vi.fn());
    const running = consumer.start();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(connectMock).toHaveBeenCalledTimes(2);
    const failed = createFakeChannel();
    failed.checkQueue.mockRejectedValueOnce(new Error("queue unavailable"));
    pending.resolve(createFakeConnection([failed]));
    const restored = createFakeChannel();
    connectMock.mockResolvedValueOnce(createFakeConnection([restored]));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(connectMock).toHaveBeenCalledTimes(3);
    expect(restored.consume).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    await consumer.stop();
    await running;
  });

  it("does not report idle recovery success after the checked channel is lost", async () => {
    vi.useFakeTimers();
    const consumer = await createJobConsumer(options);
    const interrupted = createFakeChannel();
    const restored = createFakeChannel();
    const check = deferred();
    interrupted.checkQueue.mockReturnValueOnce(check.promise);
    connection.createChannel.mockResolvedValueOnce(interrupted).mockResolvedValueOnce(restored);
    channel.emit("close");
    await vi.advanceTimersByTimeAsync(100);
    check.resolve();
    // Loss after createCheckedChannel's validation but before its caller resumes.
    void Promise.resolve().then(() => interrupted.emit("close"));
    await vi.advanceTimersByTimeAsync(0);
    expect(childLogger.info).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    expect(restored.checkQueue).toHaveBeenCalledOnce();
    expect(childLogger.info).toHaveBeenCalledOnce();
    await consumer.stop();
  });

  it("keeps retrying idle recovery with capped exponential delays and resets after success", async () => {
    vi.useFakeTimers();
    const consumer = await createJobConsumer(options);
    connectMock.mockRejectedValue(new Error("offline"));
    connection.emit("close");
    const delays = [100, 200, 400, 800, 1600, 3200, 6400, 12800, 25600, 30000, 30000];
    for (const [index, delay] of delays.entries()) {
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(connectMock).toHaveBeenCalledTimes(index + 1);
      await vi.advanceTimersByTimeAsync(1);
      expect(connectMock).toHaveBeenCalledTimes(index + 2);
    }
    const restored = createFakeChannel();
    const restoredConnection = createFakeConnection([restored]);
    connectMock.mockResolvedValueOnce(restoredConnection);
    await vi.advanceTimersByTimeAsync(30000);
    expect(restored.checkQueue).toHaveBeenCalledOnce();
    expect(restored.consume).not.toHaveBeenCalled();
    restoredConnection.emit("close");
    const attempts = connectMock.mock.calls.length;
    await vi.advanceTimersByTimeAsync(99);
    expect(connectMock).toHaveBeenCalledTimes(attempts);
    await vi.advanceTimersByTimeAsync(1);
    expect(connectMock).toHaveBeenCalledTimes(attempts + 1);
    await consumer.stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(connectMock).toHaveBeenCalledTimes(attempts + 1);
  });

  it("omits arbitrary broker error contents from structured lifecycle logs", async () => {
    vi.useFakeTimers();
    const secret = "private-broker-password";
    options.connectionOptions = `amqp://private-user:${secret}@broker`;
    const brokerError = new Error(`login failed for private-user with password ${secret}`, {
      cause: { password: secret, url: options.connectionOptions },
    });
    brokerError.name = secret;
    connectMock.mockRejectedValueOnce(brokerError);
    await expect(createJobConsumer(options)).rejects.toBe(brokerError);
    const consumer = await createJobConsumer(options);
    connection.emit("error", brokerError);
    channel.emit("error", brokerError);
    connection.emit("close", brokerError);
    connectMock.mockRejectedValueOnce(brokerError);
    await vi.advanceTimersByTimeAsync(100);
    const failed = createFakeChannel();
    const restored = createFakeChannel();
    const restoredConnection = createFakeConnection([failed, restored]);
    failed.checkQueue.mockRejectedValueOnce(brokerError);
    failed.close.mockRejectedValueOnce(brokerError);
    connectMock.mockResolvedValue(restoredConnection);
    await vi.advanceTimersByTimeAsync(200);
    await vi.advanceTimersByTimeAsync(400);
    consumer.registerJobHandler(JobType.INGESTION, vi.fn());
    const running = consumer.start();
    await vi.advanceTimersByTimeAsync(0);
    restored.cancel.mockRejectedValueOnce(brokerError);
    restored.close.mockRejectedValueOnce(brokerError);
    restoredConnection.close.mockRejectedValueOnce(brokerError);
    await consumer.stop();
    await running;
    const logs = inspect(
      [
        vi.mocked(childLogger.error).mock.calls,
        vi.mocked(childLogger.warn).mock.calls,
        vi.mocked(childLogger.info).mock.calls,
      ],
      { depth: null },
    );
    expect(logs).not.toContain(secret);
    expect(logs).not.toContain("private-user");
    expect(logs).toContain("job consumer connection recovered");
    expect(logs).toContain("job consumer unavailable; recovery scheduled");
  });

  it("ignores stale close, error, and cancellation events after resubscribing", async () => {
    vi.useFakeTimers();
    const consumer = await createJobConsumer(options);
    consumer.registerJobHandler(JobType.INGESTION, vi.fn());
    const running = consumer.start();
    await vi.advanceTimersByTimeAsync(0);
    const restored = createFakeChannel();
    connectMock.mockResolvedValueOnce(createFakeConnection([restored]));
    connection.emit("close");
    await vi.advanceTimersByTimeAsync(100);
    channel.emit("close");
    channel.emit("error", new Error("stale"));
    channel.emit("cancel");
    channel.emitMessage(null);
    connection.emit("close");
    connection.emit("error", new Error("stale"));
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(restored.consume).toHaveBeenCalledOnce();
    await consumer.stop();
    await running;
  });

  it("retries cancellation between subscription setup and recovery completion", async () => {
    vi.useFakeTimers();
    const consumer = await createJobConsumer(options);
    const pending = deferred<{ consumerTag: string }>();
    channel.consume.mockReturnValueOnce(pending.promise);
    const handler = vi.fn();
    consumer.registerJobHandler(JobType.INGESTION, handler);
    const running = consumer.start();
    await vi.advanceTimersByTimeAsync(0);
    const callback = channel.consume.mock.calls[0]![1];

    pending.resolve({ consumerTag: "cancelled-tag" });
    // subscribe() resumes first; cancellation runs before recover() resumes.
    void Promise.resolve().then(() => callback(null));
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(100);
    expect(channel.consume).toHaveBeenCalledTimes(2);
    expect(childLogger.info).toHaveBeenCalledExactlyOnceWith(
      { queue: QUEUE_NAME },
      "job consumer subscribed",
    );
    channel.emitMessage(
      createMessage(createJobEvent({ type: JobType.INGESTION, data: ingestionData })),
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(handler).toHaveBeenCalledOnce();
    expect(channel.ack).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    await consumer.stop();
    await running;
  });

  it("ignores a previous subscription callback when reusing the same channel", async () => {
    vi.useFakeTimers();
    const consumer = await createJobConsumer(options);
    const handler = vi.fn();
    consumer.registerJobHandler(JobType.INGESTION, handler);
    const running = consumer.start();
    await vi.advanceTimersByTimeAsync(0);
    const oldCallback = channel.consume.mock.calls[0]![1];
    channel.emit("cancel");
    await vi.advanceTimersByTimeAsync(100);
    expect(channel.consume).toHaveBeenCalledTimes(2);
    oldCallback(null);
    oldCallback(createMessage(createJobEvent({ type: JobType.INGESTION, data: ingestionData })));
    await vi.advanceTimersByTimeAsync(1000);
    expect(channel.consume).toHaveBeenCalledTimes(2);
    expect(handler).not.toHaveBeenCalled();
    await consumer.stop();
    await running;
  });

  it.each(["connect", "checkQueue"])(
    "stops an idle pending recovery during %s without subscribing",
    async (phase) => {
      vi.useFakeTimers();
      const consumer = await createJobConsumer(options);
      const restored = createFakeChannel();
      const restoredConnection = createFakeConnection([restored]);
      const pending = deferred();
      if (phase === "connect") {
        connectMock.mockReturnValueOnce(pending.promise.then(() => restoredConnection));
      } else {
        connectMock.mockResolvedValueOnce(restoredConnection);
        restored.checkQueue.mockReturnValueOnce(pending.promise);
      }
      connection.emit("close");
      await vi.advanceTimersByTimeAsync(100);
      const stopping = consumer.stop();
      const stoppingAgain = consumer.stop();
      pending.resolve();
      await Promise.all([stopping, stoppingAgain]);
      restoredConnection.emit("close");
      restored.emit("close");
      await vi.advanceTimersByTimeAsync(60_000);
      expect(connectMock).toHaveBeenCalledTimes(2);
      expect(restoredConnection.close).toHaveBeenCalledOnce();
      expect(restored.consume).not.toHaveBeenCalled();
      expect(restored.prefetch).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("validates, dispatches sequentially, and acknowledges after handler completion", async () => {
    const consumer = await createJobConsumer(options);
    let resolveFirst: (() => void) | undefined;
    let calls = 0;
    const handler = vi.fn(async (event: contracts.JobEventFor<JobType.INGESTION>) => {
      expect(event.type).toBe(JobType.INGESTION);
      calls += 1;
      if (calls === 1) {
        await new Promise<void>((resolve) => {
          resolveFirst = resolve;
        });
      }
    });
    consumer.registerJobHandler(JobType.INGESTION, handler);
    const running = consumer.start();
    await flush();

    const first = createJobEvent({ type: JobType.INGESTION, data: ingestionData });
    const second = createJobEvent({ type: JobType.INGESTION, data: ingestionData });
    channel.emitMessage(createMessage(first, 1));
    await flush();
    expect(handler).toHaveBeenCalledOnce();
    expect(channel.ack).not.toHaveBeenCalled();

    channel.emitMessage(createMessage(second, 2));
    await flush();
    expect(handler).toHaveBeenCalledOnce();

    resolveFirst?.();
    await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(2));
    expect(channel.ack).toHaveBeenCalledTimes(2);
    expect(channel.ack.mock.invocationCallOrder[0]).toBeLessThan(
      channel.ack.mock.invocationCallOrder[1],
    );

    await consumer.stop();
    await running;
  });

  it("rejects every processing failure for broker-managed retry and logs its context", async () => {
    const consumer = await createJobConsumer(options);
    const handlerError = new Error("handler failed");
    const handler = vi.fn(async () => {
      throw handlerError;
    });
    consumer.registerJobHandler(JobType.INGESTION, handler);
    const running = consumer.start();
    await flush();

    const malformed = createRawMessage("{not-json", 1, "exposurenexus.jobs.ingest");
    const invalidEvent = {
      ...createJobEvent({ type: JobType.INGESTION, data: ingestionData }),
      data: { ...ingestionData, unexpected: true },
    };
    const invalid = createRawMessage(JSON.stringify(invalidEvent), 2, JobType.INGESTION, {
      messageId: invalidEvent.id,
      type: JobType.INGESTION,
    });
    const unknownType = "exposurenexus.jobs.unknown";
    const unknownEvent = {
      ...createJobEvent({ type: JobType.INGESTION, data: ingestionData }),
      type: unknownType,
    };
    const unknown = createRawMessage(JSON.stringify(unknownEvent), 3, unknownType, {
      messageId: unknownEvent.id,
      type: unknownType,
    });
    const failedEvent = createJobEvent({ type: JobType.INGESTION, data: ingestionData });
    const failed = createMessage(failedEvent, 4);

    channel.emitMessage(malformed);
    channel.emitMessage(invalid);
    channel.emitMessage(unknown);
    channel.emitMessage(failed);

    await vi.waitFor(() => expect(channel.reject).toHaveBeenCalledTimes(4));
    expect(channel.reject).toHaveBeenNthCalledWith(1, malformed, true);
    expect(channel.reject).toHaveBeenNthCalledWith(2, invalid, true);
    expect(channel.reject).toHaveBeenNthCalledWith(3, unknown, true);
    expect(channel.reject).toHaveBeenNthCalledWith(4, failed, true);
    expect(channel.nack).not.toHaveBeenCalled();
    expect(handler).toHaveBeenCalledOnce();

    expect(childLogger.error).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        consumerTag: "consumer-tag",
        deliveryTag: 1,
        exchange: "EXPOSURENEXUS_JOBS",
        queue: QUEUE_NAME,
        redelivered: false,
        routingKey: "exposurenexus.jobs.ingest",
      }),
      "failed to process job",
    );
    expect(childLogger.error).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        jobId: invalidEvent.id,
        routingKey: JobType.INGESTION,
        type: JobType.INGESTION,
      }),
      "failed to process job",
    );
    expect(childLogger.error).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        jobId: unknownEvent.id,
        routingKey: unknownType,
        type: unknownType,
      }),
      "failed to process job",
    );
    expect(childLogger.error).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        err: handlerError,
        jobId: failedEvent.id,
        routingKey: failedEvent.type,
        type: failedEvent.type,
      }),
      "failed to process job",
    );

    await consumer.stop();
    await running;
  });

  it("leaves an in-flight delivery unacknowledged after connection loss", async () => {
    vi.useFakeTimers();
    const consumer = await createJobConsumer(options);
    let resolveHandler: (() => void) | undefined;
    const handler = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveHandler = resolve;
        }),
    );
    consumer.registerJobHandler(JobType.INGESTION, handler);
    const running = consumer.start();
    await vi.advanceTimersByTimeAsync(0);
    await flush();

    channel.emitMessage(
      createMessage(createJobEvent({ type: JobType.INGESTION, data: ingestionData })),
    );
    await flush();
    connection.emit("close", new Error("disconnected"));
    await flush();

    resolveHandler?.();
    await flush();
    expect(channel.ack).not.toHaveBeenCalled();
    expect(channel.reject).not.toHaveBeenCalled();

    await consumer.stop();
    await running;
  });

  it("recovers the channel and subscription after connection loss", async () => {
    vi.useFakeTimers();
    const recoveredChannel = createFakeChannel();
    const recoveredConnection = createFakeConnection([recoveredChannel]);
    connectMock.mockResolvedValueOnce(connection).mockResolvedValueOnce(recoveredConnection);
    const consumer = await createJobConsumer(options);
    consumer.registerJobHandler(JobType.INGESTION, vi.fn());
    const running = consumer.start();
    await vi.advanceTimersByTimeAsync(0);
    await flush();
    expect(channel.consume).toHaveBeenCalledOnce();

    connection.emit("close", new Error("disconnected"));
    await vi.advanceTimersByTimeAsync(100);
    await flush();

    expect(connectMock).toHaveBeenCalledTimes(2);
    expect(recoveredChannel.checkQueue).toHaveBeenCalledWith(QUEUE_NAME);
    expect(recoveredChannel.prefetch).toHaveBeenCalledWith(1);
    expect(recoveredChannel.consume).toHaveBeenCalledOnce();
    expect(childLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ queue: QUEUE_NAME }),
      "job consumer unavailable; recovery scheduled",
    );

    await consumer.stop();
    await running;
  });

  it("retries a temporarily unavailable queue topology", async () => {
    vi.useFakeTimers();
    const missingChannel = createFakeChannel();
    const restoredChannel = createFakeChannel();
    missingChannel.checkQueue.mockRejectedValueOnce(new Error("queue unavailable"));
    connection.createChannel
      .mockReset()
      .mockResolvedValueOnce(channel)
      .mockResolvedValueOnce(missingChannel)
      .mockResolvedValueOnce(restoredChannel);
    const consumer = await createJobConsumer(options);
    consumer.registerJobHandler(JobType.INGESTION, vi.fn());
    const running = consumer.start();
    await flush();

    channel.emit("close");
    await vi.advanceTimersByTimeAsync(100);
    await flush();
    expect(missingChannel.checkQueue).toHaveBeenCalledWith(QUEUE_NAME);

    await vi.advanceTimersByTimeAsync(200);
    await flush();
    expect(restoredChannel.checkQueue).toHaveBeenCalledWith(QUEUE_NAME);
    expect(restoredChannel.consume).toHaveBeenCalledOnce();

    await consumer.stop();
    await running;
  });

  it("does not dispatch deliveries after shutdown begins", async () => {
    let resolveCancel: (() => void) | undefined;
    channel.cancel.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveCancel = resolve;
        }),
    );
    const consumer = await createJobConsumer(options);
    const handler = vi.fn();
    consumer.registerJobHandler(JobType.INGESTION, handler);
    const running = consumer.start();
    await flush();

    const stopping = consumer.stop();
    await flush();
    channel.emitMessage(
      createMessage(createJobEvent({ type: JobType.INGESTION, data: ingestionData })),
    );
    await flush();

    expect(handler).not.toHaveBeenCalled();
    resolveCancel?.();
    await stopping;
    await running;
  });

  it("cancels, waits for the active handler, and closes cleanly", async () => {
    const consumer = await createJobConsumer(options);
    let resolveHandler: (() => void) | undefined;
    const handler = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveHandler = resolve;
        }),
    );
    consumer.registerJobHandler(JobType.INGESTION, handler);
    const running = consumer.start();
    await flush();

    const event = createJobEvent({ type: JobType.INGESTION, data: ingestionData });
    channel.emitMessage(createMessage(event));
    await flush();

    const stopping = consumer.stop();
    await flush();
    expect(channel.cancel).toHaveBeenCalledWith("consumer-tag");
    expect(channel.close).not.toHaveBeenCalled();
    expect(connection.close).not.toHaveBeenCalled();

    resolveHandler?.();
    await stopping;
    await running;
    expect(channel.ack).toHaveBeenCalledOnce();
    expect(channel.close).toHaveBeenCalledOnce();
    expect(connection.close).toHaveBeenCalledOnce();
  });
});
