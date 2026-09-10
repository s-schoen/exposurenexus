import { EventEmitter } from "node:events";
import { createRequire } from "node:module";

import { createJobEvent, JobType } from "@exposurenexus/jobs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readConfig } from "./env.js";
import { createLogger } from "./logging.js";
import { deferred } from "./test/deferred.js";
import { runWorker } from "./worker.js";

import type { BackendRuntime } from "@exposurenexus/backend";
import type { JobHandler } from "@exposurenexus/jobs/consumer";

// Mock only the transport owned by jobs, leaving its exported consumer intact.
const transportPath = createRequire(import.meta.resolve("@exposurenexus/jobs/consumer")).resolve(
  "amqplib",
);

function broker() {
  type Message = {
    content: Buffer;
    fields: {
      deliveryTag: number;
      consumerTag: string;
      exchange: string;
      routingKey: string;
      redelivered: boolean;
    };
    properties: { messageId: string; type: string };
  };
  let delivery: ((message: Message | null) => void) | undefined;
  const order: string[] = [];
  const channel = Object.assign(new EventEmitter(), {
    checkQueue: vi.fn(async () => ({})),
    prefetch: vi.fn(async () => {}),
    consume: vi.fn(async (_queue: string, callback: typeof delivery) => {
      delivery = callback;
      return { consumerTag: "worker-test" };
    }),
    cancel: vi.fn(async () => {
      order.push("cancel");
    }),
    ack: vi.fn(() => {
      order.push("ack");
    }),
    reject: vi.fn(),
    close: vi.fn(async () => {
      order.push("channel.close");
    }),
  });
  const connection = Object.assign(new EventEmitter(), {
    createChannel: vi.fn(async () => channel),
    close: vi.fn(async () => {
      order.push("connection.close");
    }),
  });
  return {
    order,
    channel,
    connection,
    deliver(deliveryTag: number) {
      const event = createJobEvent({
        type: JobType.INGESTION,
        data: {
          userid: "550e8400-e29b-41d4-a716-446655440000",
          ingestdataurl: "https://example.com/ingest.json",
          format: "json",
        },
      });
      delivery?.({
        content: Buffer.from(JSON.stringify(event)),
        fields: {
          deliveryTag,
          consumerTag: "worker-test",
          exchange: "jobs",
          routingKey: event.type,
          redelivered: false,
        },
        properties: { messageId: event.id, type: event.type },
      });
    },
  };
}

describe("worker with the jobs consumer", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.doUnmock(transportPath);
    vi.resetModules();
    vi.useRealTimers();
  });

  async function setup(
    handler?: JobHandler,
    configure?: (transport: ReturnType<typeof broker>) => void,
  ) {
    const transport = broker();
    configure?.(transport);
    const connect = vi.fn(async () => transport.connection);
    vi.doMock(transportPath, () => ({ connect }));
    const { createJobConsumer } = await import("@exposurenexus/jobs/consumer");
    const logger = createLogger("silent");
    vi.spyOn(logger, "info");
    vi.spyOn(logger, "error");
    const config = readConfig({
      DATABASE_URL: "postgres://localhost/db",
      RABBITMQ_URL: "amqp://localhost",
    });
    const close = vi.fn(async () => {
      transport.order.push("database.close");
    });
    const exit = vi.fn();
    const signals = new EventEmitter();
    const worker = runWorker(config, logger, {
      openDatabase: () => ({
        check: async () => {},
        createRuntime: () => ({}) as BackendRuntime,
        close,
      }),
      openConsumer: () =>
        createJobConsumer({
          connectionOptions: config.RABBITMQ_URL,
          queueName: config.RABBITMQ_QUEUE,
          logger,
        }),
      createHandlers: () => (handler ? { [JobType.INGESTION]: handler } : {}),
      signals,
      exit,
    });
    await vi.advanceTimersByTimeAsync(0);
    return { ...transport, connect, close, exit, signals, worker, logger };
  }

  it("checks the queue and recovers idle connections without subscribing or settling messages", async () => {
    const f = await setup();
    expect(f.channel.checkQueue).toHaveBeenCalledWith("EXPOSURENEXUS_JOBS_INGEST");
    expect(f.channel.consume).not.toHaveBeenCalled();
    f.connection.emit("close");
    await vi.advanceTimersByTimeAsync(100);
    expect(f.connect).toHaveBeenCalledTimes(2);
    expect(f.channel.consume).not.toHaveBeenCalled();
    expect(f.channel.prefetch).not.toHaveBeenCalled();
    expect(f.channel.ack).not.toHaveBeenCalled();
    expect(f.channel.reject).not.toHaveBeenCalled();
    await f.worker.shutdown();
  });

  it("cleans up the real consumer's failed passive queue check before the database", async () => {
    const f = await setup(undefined, ({ channel }) => {
      channel.checkQueue.mockRejectedValue(new Error("queue missing"));
    });
    await f.worker.stopped;
    expect(f.exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(f.channel.consume).not.toHaveBeenCalled();
    expect(f.connect).toHaveBeenCalledOnce();
    expect(f.order).toEqual(["channel.close", "connection.close", "database.close"]);
  });

  it.each(["checkQueue", "prefetch", "consume"] as const)(
    "fails startup on initial subscription %s failure instead of retrying indefinitely",
    async (phase) => {
      const f = await setup(vi.fn(), ({ channel }) => {
        if (phase === "checkQueue") channel.checkQueue.mockResolvedValueOnce({});
        channel[phase].mockRejectedValue(new Error("amqp://user:secret@host"));
      });
      expect(await f.worker.ready).toBe(false);
      await f.worker.stopped;
      expect(f.exit).toHaveBeenCalledExactlyOnceWith(1);
      expect(f.close).toHaveBeenCalledOnce();
      expect(f.logger.info).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining("startup completed"),
      );
      expect(JSON.stringify(vi.mocked(f.logger.error).mock.calls)).not.toContain("secret");
      await vi.advanceTimersByTimeAsync(60_000);
      expect(f.connect).toHaveBeenCalledOnce();
      expect(f.channel[phase]).toHaveBeenCalledTimes(phase === "checkQueue" ? 2 : 1);
    },
  );

  it.each(["checkQueue", "prefetch", "consume"] as const)(
    "keeps hung initial %s under startup and hard shutdown deadlines",
    async (phase) => {
      const f = await setup(vi.fn(), ({ channel }) => {
        if (phase === "checkQueue") channel.checkQueue.mockResolvedValueOnce({});
        channel[phase].mockReturnValue(new Promise<never>(() => {}));
      });
      const ready = vi.fn();
      void f.worker.ready.then(ready);
      await vi.advanceTimersByTimeAsync(29_999);
      expect(ready).not.toHaveBeenCalled();
      expect(f.logger.info).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining("startup completed"),
      );
      await vi.advanceTimersByTimeAsync(1);
      expect(f.logger.error).toHaveBeenCalledWith(
        { stage: "consumer activation" },
        "worker startup deadline expired",
      );
      await vi.advanceTimersByTimeAsync(59_999);
      expect(f.exit).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(f.exit).toHaveBeenCalledExactlyOnceWith(1);
      expect(f.close).not.toHaveBeenCalled();
      expect(f.channel.ack).not.toHaveBeenCalled();
      expect(f.channel.reject).not.toHaveBeenCalled();
    },
  );

  it("starts shutdown immediately on activation failure even when failed-channel cleanup hangs", async () => {
    const f = await setup(vi.fn(), ({ channel }) => {
      channel.consume.mockRejectedValueOnce(new Error("secret"));
      channel.close.mockReturnValueOnce(new Promise(() => {}));
    });
    expect(await f.worker.ready).toBe(false);
    expect(f.logger.error).toHaveBeenCalledWith(
      { stage: "consumer activation" },
      "worker startup failed",
    );
    await vi.advanceTimersByTimeAsync(60_000);
    expect(f.exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(f.close).not.toHaveBeenCalled();
  });

  it("stops during pending activation, cancels a late subscription, and never reports readiness", async () => {
    const pending = deferred<{ consumerTag: string }>();
    const f = await setup(vi.fn(), ({ channel }) => {
      channel.consume.mockReturnValueOnce(pending.promise);
    });
    f.signals.emit("SIGTERM");
    await vi.advanceTimersByTimeAsync(35_000);
    expect(await f.worker.ready).toBe(false);
    expect(f.exit).not.toHaveBeenCalled();
    expect(f.close).not.toHaveBeenCalled();
    expect(f.logger.error).not.toHaveBeenCalledWith(
      expect.anything(),
      "worker startup deadline expired",
    );
    pending.resolve({ consumerTag: "late" });
    await f.worker.stopped;
    expect(f.channel.cancel).toHaveBeenCalledExactlyOnceWith("late");
    expect(f.exit).toHaveBeenCalledExactlyOnceWith(0);
    expect(f.order).toEqual(["cancel", "channel.close", "connection.close", "database.close"]);
    expect(f.logger.info).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("startup completed"),
    );
  });

  it("keeps recovering after confirmed activation without re-entering startup", async () => {
    const f = await setup(vi.fn());
    expect(await f.worker.ready).toBe(true);
    f.connection.emit("close");
    await vi.advanceTimersByTimeAsync(100);
    expect(f.connect).toHaveBeenCalledTimes(2);
    expect(f.channel.consume).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(f.exit).not.toHaveBeenCalled();
    expect(await f.worker.ready).toBe(true);
    await f.worker.shutdown();
  });

  it("dispatches sequentially and drains accepted deliveries before closing dependencies", async () => {
    const first = deferred();
    const second = deferred();
    const handler = vi
      .fn<JobHandler>()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const f = await setup(handler);
    expect(f.channel.prefetch).toHaveBeenCalledExactlyOnceWith(1);
    expect(f.channel.consume).toHaveBeenCalledWith(
      "EXPOSURENEXUS_JOBS_INGEST",
      expect.any(Function),
      { noAck: false },
    );
    f.deliver(1);
    f.deliver(2);
    await vi.advanceTimersByTimeAsync(0);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(f.channel.ack).not.toHaveBeenCalled();
    f.signals.emit("SIGTERM");
    await vi.advanceTimersByTimeAsync(0);
    expect(f.channel.cancel).toHaveBeenCalledOnce();
    f.deliver(3);
    expect(f.close).not.toHaveBeenCalled();
    first.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(handler).toHaveBeenCalledTimes(2);
    expect(f.channel.ack).toHaveBeenCalledTimes(1);
    expect(f.close).not.toHaveBeenCalled();
    second.resolve();
    await f.worker.stopped;
    expect(handler).toHaveBeenCalledTimes(2);
    expect(f.order).toEqual([
      "cancel",
      "ack",
      "ack",
      "channel.close",
      "connection.close",
      "database.close",
    ]);
    expect(f.exit).toHaveBeenCalledExactlyOnceWith(0);
  });

  it("forces termination without acknowledging a still-running handler", async () => {
    const f = await setup(() => new Promise(() => {}));
    f.deliver(1);
    await vi.advanceTimersByTimeAsync(0);
    f.signals.emit("SIGINT");
    await vi.advanceTimersByTimeAsync(60_000);
    await f.worker.stopped;
    expect(f.channel.cancel).toHaveBeenCalledOnce();
    expect(f.channel.ack).not.toHaveBeenCalled();
    expect(f.channel.reject).not.toHaveBeenCalled();
    expect(f.close).not.toHaveBeenCalled();
    expect(f.exit).toHaveBeenCalledExactlyOnceWith(1);
  });
});
