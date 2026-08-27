import { EventEmitter } from "node:events";

import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import * as contracts from "./index.js";
import { JobType } from "./index.js";
import { createJobProducer } from "./producer.js";

import type { JobEvent } from "./index.js";
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

const ingestionEvent: JobEvent = {
  specversion: "1.0",
  id: "550e8400-e29b-41d4-a716-446655440001",
  source: "/services/api",
  type: JobType.INGESTION,
  time: "2026-08-27T12:00:00.000Z",
  datacontenttype: "application/json",
  subject: "ingestion/550e8400-e29b-41d4-a716-446655440000",
  data: ingestionData,
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

  it("accepts complete job events and returns void", async () => {
    const producer = await createJobProducer(options);
    const publication = producer.publish(ingestionEvent);

    expectTypeOf(publication).toEqualTypeOf<Promise<void>>();
    await expect(publication).resolves.toBeUndefined();

    const assertRejectedTypes = () => {
      void producer.publish({
        ...ingestionEvent,
        // @ts-expect-error the format field is required by the public event type
        data: {
          userid: ingestionData.userid,
          ingestdataurl: ingestionData.ingestdataurl,
        },
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

  it("publishes the supplied persistent, mandatory CloudEvent and waits for confirmation", async () => {
    let confirm: ((error: Error | null) => void) | undefined;
    channel.publish = vi
      .fn()
      .mockImplementation((_exchange, _routingKey, _content, _options, callback) => {
        confirm = callback;
        return true;
      });
    const producer = await createJobProducer(options);

    const publication = producer.publish(ingestionEvent);
    await Promise.resolve();
    expect(confirm).toBeDefined();

    const [exchange, routingKey, content, publishOptions] = channel.publish.mock.calls[0] as [
      string,
      string,
      Buffer,
      Record<string, unknown>,
    ];
    expect(exchange).toBe(EXCHANGE_NAME);
    expect(routingKey).toBe(ingestionEvent.type);
    expect(JSON.parse(content.toString())).toEqual(ingestionEvent);
    expect(publishOptions).toEqual({
      contentType: ingestionEvent.datacontenttype,
      mandatory: true,
      messageId: ingestionEvent.id,
      persistent: true,
      timestamp: Date.parse(ingestionEvent.time),
      type: ingestionEvent.type,
    });

    let settled = false;
    void publication.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    confirm?.(null);
    await expect(publication).resolves.toBeUndefined();
    await producer.close();
  });

  it("reuses the supplied event identity across publication attempts", async () => {
    const producer = await createJobProducer(options);

    await Promise.all([producer.publish(ingestionEvent), producer.publish(ingestionEvent)]);

    expect(channel.publish).toHaveBeenCalledTimes(2);
    expect(channel.publish.mock.calls.map((call) => call[3].messageId)).toEqual([
      ingestionEvent.id,
      ingestionEvent.id,
    ]);
    expect(
      channel.publish.mock.calls.map((call) => JSON.parse((call[2] as Buffer).toString())),
    ).toEqual([ingestionEvent, ingestionEvent]);
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

    const negativeConfirmation = producer.publish(ingestionEvent);
    confirm?.(new Error("nack"));
    await expect(negativeConfirmation).rejects.toThrow("nack");

    const returned = producer.publish(ingestionEvent);
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

  it("rejects invalid job events before publishing", async () => {
    const producer = await createJobProducer(options);
    const invalidEvent = {
      ...ingestionEvent,
      data: { ...ingestionData, extra: true },
    } as JobEvent;

    await expect(producer.publish(invalidEvent)).rejects.toThrow();
    expect(channel.publish).not.toHaveBeenCalled();
    expect(childLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.anything() }),
      "failed to publish job",
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

  it("rejects a channel whose connection closes during setup", async () => {
    let resolveExchangeCheck: (() => void) | undefined;
    channel.checkExchange.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveExchangeCheck = resolve;
        }),
    );

    const creating = createJobProducer(options);
    await vi.waitFor(() => expect(channel.checkExchange).toHaveBeenCalledWith(EXCHANGE_NAME));
    connection.emit("close", new Error("disconnected during setup"));
    resolveExchangeCheck?.();

    await expect(creating).rejects.toThrow("connection closed during setup");
    expect(channel.close).toHaveBeenCalledOnce();
  });

  it("rejects calls while disconnected and recovers after an established connection closes", async () => {
    vi.useFakeTimers();
    const recoveredChannel = createFakeChannel();
    const recoveredConnection = createFakeConnection(recoveredChannel);
    connectMock.mockResolvedValueOnce(connection).mockResolvedValueOnce(recoveredConnection);
    const producer = await createJobProducer(options);

    connection.emit("close", new Error("disconnected"));
    await expect(producer.publish(ingestionEvent)).rejects.toThrow("not connected");

    await vi.advanceTimersByTimeAsync(100);
    expect(connectMock).toHaveBeenCalledTimes(2);
    expect(recoveredChannel.checkExchange).toHaveBeenCalledWith(EXCHANGE_NAME);

    await producer.close();
  });

  it("retries when a replacement connection closes during its exchange check", async () => {
    vi.useFakeTimers();
    let resolveExchangeCheck: (() => void) | undefined;
    const staleChannel = createFakeChannel();
    staleChannel.checkExchange.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveExchangeCheck = resolve;
        }),
    );
    const staleConnection = createFakeConnection(staleChannel);
    const restoredChannel = createFakeChannel();
    const restoredConnection = createFakeConnection(restoredChannel);
    connectMock
      .mockResolvedValueOnce(connection)
      .mockResolvedValueOnce(staleConnection)
      .mockResolvedValueOnce(restoredConnection);
    const producer = await createJobProducer(options);

    connection.emit("close", new Error("initial connection lost"));
    await vi.advanceTimersByTimeAsync(100);
    expect(staleChannel.checkExchange).toHaveBeenCalledWith(EXCHANGE_NAME);

    staleConnection.emit("close", new Error("replacement connection lost"));
    resolveExchangeCheck?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(staleChannel.close).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(200);
    expect(connectMock).toHaveBeenCalledTimes(3);
    expect(restoredChannel.checkExchange).toHaveBeenCalledWith(EXCHANGE_NAME);
    await expect(producer.publish(ingestionEvent)).resolves.toBeUndefined();

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

    const pendingEvent = producer.publish(ingestionEvent);
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

    const firstPublication = producer.publish(ingestionEvent);
    await expect(producer.publish(ingestionEvent)).rejects.toThrow("buffer is full");

    channel.emit("drain");
    confirm?.();
    await expect(firstPublication).resolves.toBeUndefined();
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
