import { EventEmitter } from "node:events";

import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import { createJobConsumer } from "./consumer.js";
import * as contracts from "./index.js";
import { createJobEvent, JobType } from "./index.js";

import type { JobConsumerOptions, JobHandler } from "./consumer.js";
import type { ConsumeMessage } from "amqplib";
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
  consume: ReturnType<typeof vi.fn>;
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
