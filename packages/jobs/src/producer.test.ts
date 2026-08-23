import { EventEmitter } from "node:events";

import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import * as contracts from "./index.js";
import { JobType } from "./index.js";
import { createJobProducer } from "./producer.js";

import type { JobEventFor } from "./index.js";
import type { JobProducerOptions } from "./producer.js";
import type { Logger } from "pino";

const { connectMock } = vi.hoisted(() => ({
  connectMock: vi.fn(),
}));

vi.mock("amqplib", () => ({
  connect: connectMock,
}));

const EXCHANGE_NAME = "EXPOSURENEXUS_JOBS";
const CONNECTION_URL = "amqp://127.0.0.1:5672";
const ingestionData = {
  userid: "550e8400-e29b-41d4-a716-446655440000",
  ingestdataurl: "https://example.com/ingest.json",
  format: "json",
};

type FakeChannel = EventEmitter & {
  assertExchange: ReturnType<typeof vi.fn>;
  checkExchange: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  publish: ReturnType<typeof vi.fn>;
  waitForConfirms: ReturnType<typeof vi.fn>;
};

type FakeConnection = EventEmitter & {
  close: ReturnType<typeof vi.fn>;
  createConfirmChannel: ReturnType<typeof vi.fn>;
};

function createFakeChannel(): FakeChannel {
  const channel = new EventEmitter() as FakeChannel;
  channel.assertExchange = vi.fn();
  channel.checkExchange = vi.fn().mockResolvedValue({});
  channel.close = vi.fn().mockResolvedValue(undefined);
  channel.publish = vi
    .fn()
    .mockImplementation((_exchange, _routingKey, _content, _options, callback) => {
      callback?.(null, {});
      return true;
    });
  channel.waitForConfirms = vi.fn().mockResolvedValue(undefined);
  return channel;
}

function createFakeConnection(channel: FakeChannel): FakeConnection {
  const connection = new EventEmitter() as FakeConnection;
  connection.close = vi.fn().mockResolvedValue(undefined);
  connection.createConfirmChannel = vi.fn().mockResolvedValue(channel);
  return connection;
}

describe("createJobProducer", () => {
  const childLogger = {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  } as unknown as Logger;
  const childMock = vi.fn(() => childLogger);
  const logger = {
    child: childMock,
  } as unknown as Logger;
  const options: JobProducerOptions = {
    connectionOptions: CONNECTION_URL,
    exchangeName: EXCHANGE_NAME,
    logger,
    socketOptions: { noDelay: true },
  };

  let channel: FakeChannel;
  let connection: FakeConnection;

  beforeEach(() => {
    vi.clearAllMocks();
    channel = createFakeChannel();
    connection = createFakeConnection(channel);
    connectMock.mockResolvedValue(connection);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps producer exports out of the contracts-only root entry point", () => {
    expect(contracts).not.toHaveProperty("createJobProducer");
    expect(contracts).not.toHaveProperty("JobProducer");
    expect(contracts).not.toHaveProperty("JobProducerOptions");
  });

  it("keeps the job type and payload types correlated", async () => {
    const producer = await createJobProducer(options);
    const event = producer.enqueue(JobType.INGESTION, ingestionData);

    expectTypeOf(event).resolves.toEqualTypeOf<JobEventFor<JobType.INGESTION>>();

    const assertRejectedTypes = () => {
      // @ts-expect-error the format field is required by the public payload type
      void producer.enqueue(JobType.INGESTION, {
        userid: ingestionData.userid,
        ingestdataurl: ingestionData.ingestdataurl,
      });
    };

    expect(assertRejectedTypes).toBeTypeOf("function");
    await producer.close();
  });

  it("connects with the supplied options and passively checks the exchange", async () => {
    const producer = await createJobProducer(options);

    expect(connectMock).toHaveBeenCalledWith(options.connectionOptions, options.socketOptions);
    expect(childMock).toHaveBeenCalledWith({ component: "job-producer" });
    expect(connection.createConfirmChannel).toHaveBeenCalledOnce();
    expect(channel.checkExchange).toHaveBeenCalledWith(EXCHANGE_NAME);
    expect(channel.assertExchange).not.toHaveBeenCalled();

    await producer.close();
  });

  it("publishes a persistent, mandatory CloudEvent and waits for confirmation", async () => {
    let confirm: ((error: Error | null) => void) | undefined;
    channel.publish = vi
      .fn()
      .mockImplementation((_exchange, _routingKey, _content, _options, callback) => {
        confirm = callback;
        return true;
      });
    const producer = await createJobProducer(options);

    const pendingEvent = producer.enqueue(JobType.INGESTION, ingestionData);
    await Promise.resolve();
    expect(confirm).toBeDefined();

    const [exchange, routingKey, content, publishOptions] = channel.publish.mock.calls[0] as [
      string,
      string,
      Buffer,
      Record<string, unknown>,
    ];
    expect(exchange).toBe(EXCHANGE_NAME);
    expect(routingKey).toBe(JobType.INGESTION);

    const event = JSON.parse(content.toString()) as JobEventFor<JobType.INGESTION>;
    expect(event.data).toEqual(ingestionData);
    expect(publishOptions).toEqual({
      contentType: "application/json",
      mandatory: true,
      messageId: event.id,
      persistent: true,
      timestamp: Date.parse(event.time),
      type: JobType.INGESTION,
    });

    let settled = false;
    void pendingEvent.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    confirm?.(null);
    await expect(pendingEvent).resolves.toEqual(event);
    await producer.close();
  });

  it("rejects negative confirmations and mandatory returns", async () => {
    let confirm: ((error: Error | null) => void) | undefined;
    channel.publish = vi
      .fn()
      .mockImplementation((_exchange, _routingKey, _content, _options, callback) => {
        confirm = callback;
        return true;
      });
    const producer = await createJobProducer(options);

    const negativeConfirmation = producer.enqueue(JobType.INGESTION, ingestionData);
    confirm?.(new Error("nack"));
    await expect(negativeConfirmation).rejects.toThrow("nack");

    const returned = producer.enqueue(JobType.INGESTION, ingestionData);
    const secondPublish = channel.publish.mock.calls[1] as [
      string,
      string,
      Buffer,
      { messageId: string },
      unknown,
    ];
    channel.emit("return", {
      content: secondPublish[2],
      fields: { exchange: EXCHANGE_NAME, routingKey: JobType.INGESTION },
      properties: { messageId: secondPublish[3].messageId },
    });
    await expect(returned).rejects.toThrow("was returned because it was not routed");

    await producer.close();
  });

  it("rejects invalid job data before publishing", async () => {
    const producer = await createJobProducer(options);
    const invalidData = { ...ingestionData, extra: true };

    await expect(
      producer.enqueue(JobType.INGESTION, invalidData as typeof ingestionData),
    ).rejects.toThrow();
    expect(channel.publish).not.toHaveBeenCalled();
    expect(childLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ type: JobType.INGESTION }),
      "failed to enqueue job",
    );

    await producer.close();
  });

  it("rejects initial connection and missing exchange without declaring topology", async () => {
    const connectionError = new Error("connection failed");
    connectMock.mockRejectedValueOnce(connectionError);
    await expect(createJobProducer(options)).rejects.toBe(connectionError);

    const missingExchangeChannel = createFakeChannel();
    missingExchangeChannel.checkExchange = vi.fn().mockRejectedValue(new Error("not found"));
    const missingExchangeConnection = createFakeConnection(missingExchangeChannel);
    connectMock.mockResolvedValueOnce(missingExchangeConnection);

    await expect(createJobProducer(options)).rejects.toThrow("not found");
    expect(missingExchangeChannel.assertExchange).not.toHaveBeenCalled();
    expect(missingExchangeConnection.close).toHaveBeenCalledOnce();
  });

  it("rejects calls while disconnected and recovers after an established connection closes", async () => {
    vi.useFakeTimers();
    const recoveredChannel = createFakeChannel();
    const recoveredConnection = createFakeConnection(recoveredChannel);
    connectMock.mockResolvedValueOnce(connection).mockResolvedValueOnce(recoveredConnection);
    const producer = await createJobProducer(options);

    connection.emit("close", new Error("disconnected"));
    await expect(producer.enqueue(JobType.INGESTION, ingestionData)).rejects.toThrow(
      "not connected",
    );

    await vi.advanceTimersByTimeAsync(100);
    expect(connectMock).toHaveBeenCalledTimes(2);
    expect(recoveredChannel.checkExchange).toHaveBeenCalledWith(EXCHANGE_NAME);

    await producer.close();
  });

  it("logs topology loss and retries until the exchange is available", async () => {
    vi.useFakeTimers();
    const missingExchangeChannel = createFakeChannel();
    missingExchangeChannel.checkExchange.mockRejectedValueOnce(new Error("exchange missing"));
    const restoredChannel = createFakeChannel();
    connection.createConfirmChannel
      .mockResolvedValueOnce(channel)
      .mockResolvedValueOnce(missingExchangeChannel)
      .mockResolvedValueOnce(restoredChannel);
    const producer = await createJobProducer(options);

    channel.emit("close");
    await vi.advanceTimersByTimeAsync(100);
    expect(childLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ exchange: EXCHANGE_NAME }),
      "job producer recovery failed",
    );

    await vi.advanceTimersByTimeAsync(200);
    expect(restoredChannel.checkExchange).toHaveBeenCalledWith(EXCHANGE_NAME);
    await producer.close();
  });

  it("rejects an in-flight publish when its connection is lost", async () => {
    vi.useFakeTimers();
    channel.publish.mockImplementation(
      (_exchange, _routingKey, _content, _options, _callback) => true,
    );
    const producer = await createJobProducer(options);

    const pendingEvent = producer.enqueue(JobType.INGESTION, ingestionData);
    connection.emit("close", new Error("disconnected"));
    await expect(pendingEvent).rejects.toThrow("disconnected");
    await producer.close();
  });

  it("does not accept another job while the channel write buffer is full", async () => {
    let confirm: (() => void) | undefined;
    channel.publish.mockImplementation((_exchange, _routingKey, _content, _options, callback) => {
      confirm = () => callback?.(null, {});
      return false;
    });
    const producer = await createJobProducer(options);

    const firstEvent = producer.enqueue(JobType.INGESTION, ingestionData);
    await expect(producer.enqueue(JobType.INGESTION, ingestionData)).rejects.toThrow(
      "buffer is full",
    );

    channel.emit("drain");
    confirm?.();
    await expect(firstEvent).resolves.toMatchObject({ type: JobType.INGESTION });
    await producer.close();
  });

  it("waits for publisher confirmations before closing owned resources", async () => {
    let resolveConfirmations: (() => void) | undefined;
    channel.waitForConfirms = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveConfirmations = resolve;
        }),
    );
    const producer = await createJobProducer(options);

    const closing = producer.close();
    await Promise.resolve();
    expect(channel.close).not.toHaveBeenCalled();
    expect(connection.close).not.toHaveBeenCalled();

    resolveConfirmations?.();
    await closing;
    expect(channel.close).toHaveBeenCalledOnce();
    expect(connection.close).toHaveBeenCalledOnce();
  });
});
