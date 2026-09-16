import { EventEmitter } from "node:events";

import { JobType } from "@exposurenexus/jobs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readConfig } from "./env.js";
import { deferred } from "./test/deferred.js";
import { runWorker } from "./worker.js";

import type { WorkerDependencies, WorkerHandlers } from "./worker.js";
import type { BackendRuntime } from "@exposurenexus/backend";
import type { ObjectStorage } from "@exposurenexus/backend/object-storage";
import type { Logger } from "pino";

function setup(handlers: WorkerHandlers = {}) {
  const order: string[] = [];
  const runtime = {} as BackendRuntime;
  const lifetime = deferred();
  const database = {
    check: vi.fn(async () => {
      order.push("check");
    }),
    createRuntime: vi.fn(() => {
      order.push("runtime");
      return runtime;
    }),
    close: vi.fn(async () => {
      order.push("database.close");
    }),
  };
  const storage = {
    bucket: "scan-inputs",
    read: vi.fn(),
    write: vi.fn(),
    delete: vi.fn(),
    close: vi.fn(() => {
      order.push("storage.close");
    }),
  } satisfies ObjectStorage;
  const consumer = {
    registerJobHandler: vi.fn(() => {
      order.push("register");
    }),
    start: vi.fn(() => {
      order.push("start");
      return lifetime.promise;
    }),
    waitForInitialActivation: vi.fn(async () => {}),
    stop: vi.fn(async () => {
      order.push("consumer.stop");
      lifetime.resolve();
    }),
  };
  const signals = new EventEmitter();
  const log = { info: vi.fn(), error: vi.fn(), fatal: vi.fn() };
  const config = readConfig({
    DATABASE_URL: "postgres://localhost/db",
    RABBITMQ_URL: "amqp://localhost",
    S3_BUCKET: "scan-inputs",
    S3_REGION: "us-east-1",
    S3_ACCESS_KEY_ID: "test-key",
    S3_SECRET_ACCESS_KEY: "test-secret",
  });
  const dependencies = {
    openDatabase: vi.fn(() => {
      order.push("database");
      return database;
    }),
    openConsumer: vi.fn(async () => {
      order.push("consumer");
      return consumer;
    }),
    openStorage: vi.fn(() => {
      order.push("storage");
      return storage;
    }),
    createHandlers: vi.fn((_runtime: BackendRuntime, _storage: ObjectStorage) => {
      order.push("handlers");
      return handlers;
    }),
    signals,
    exit: vi.fn(),
  } satisfies WorkerDependencies;
  return {
    order,
    runtime,
    lifetime,
    database,
    storage,
    consumer,
    signals,
    log,
    config,
    dependencies,
    run: () => runWorker(config, log as unknown as Logger, dependencies),
  };
}

describe("worker lifecycle", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("initializes in order, supports idle handlers, and drains before closing storage and database", async () => {
    const f = setup();
    const worker = f.run();
    expect(await worker.ready).toBe(true);
    expect(f.order).toEqual(["database", "check", "storage", "runtime", "handlers", "consumer"]);
    expect(f.dependencies.createHandlers).toHaveBeenCalledWith(f.runtime, f.storage);
    expect(f.storage.read).not.toHaveBeenCalled();
    expect(f.storage.write).not.toHaveBeenCalled();
    expect(f.storage.delete).not.toHaveBeenCalled();
    expect(f.consumer.start).not.toHaveBeenCalled();
    expect(f.consumer.waitForInitialActivation).not.toHaveBeenCalled();
    expect(f.consumer.registerJobHandler).not.toHaveBeenCalled();
    expect(f.log.info).toHaveBeenCalledWith(expect.stringContaining("intentionally idle"));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(f.dependencies.exit).not.toHaveBeenCalled();
    await worker.shutdown();
    expect(f.order.slice(-3)).toEqual(["consumer.stop", "storage.close", "database.close"]);
    expect(f.dependencies.exit).toHaveBeenCalledExactlyOnceWith(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("automatically activates a complete injected set without awaiting its lifetime", async () => {
    const handler = vi.fn();
    const f = setup({ [JobType.INGESTION]: handler });
    const worker = f.run();
    expect(await worker.ready).toBe(true);
    expect(f.consumer.registerJobHandler).toHaveBeenCalledExactlyOnceWith(
      JobType.INGESTION,
      handler,
    );
    expect(f.consumer.start).toHaveBeenCalledOnce();
    expect(f.consumer.waitForInitialActivation).toHaveBeenCalledOnce();
    expect(f.order.indexOf("register")).toBeLessThan(f.order.indexOf("start"));
    await vi.advanceTimersByTimeAsync(f.config.STARTUP_TIMEOUT_MS + 1);
    expect(f.dependencies.exit).not.toHaveBeenCalled();
    await worker.shutdown();
  });

  it.each([false, true])(
    "handles asynchronous activation rejection with hung stop=%s",
    async (hung) => {
      const f = setup({ [JobType.INGESTION]: vi.fn() });
      const activation = deferred();
      f.consumer.waitForInitialActivation.mockReturnValue(activation.promise);
      if (hung) f.consumer.stop.mockReturnValue(new Promise(() => {}));
      const worker = f.run();
      await vi.advanceTimersByTimeAsync(0);
      activation.reject(new Error("amqp://user:secret@host"));
      expect(await worker.ready).toBe(false);
      await vi.advanceTimersByTimeAsync(0);
      expect(f.consumer.stop).toHaveBeenCalledOnce();
      expect(f.log.error).toHaveBeenCalledWith(
        { stage: "consumer activation" },
        "worker startup failed",
      );
      expect(JSON.stringify(f.log.error.mock.calls)).not.toContain("secret");
      if (hung) {
        await vi.advanceTimersByTimeAsync(f.config.SHUTDOWN_TIMEOUT_MS - 1);
        expect(f.dependencies.exit).not.toHaveBeenCalled();
        expect(f.database.close).not.toHaveBeenCalled();
        expect(f.storage.close).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
      }
      await worker.stopped;
      expect(f.database.close).toHaveBeenCalledTimes(hung ? 0 : 1);
      expect(f.storage.close).toHaveBeenCalledTimes(hung ? 0 : 1);
      expect(f.dependencies.exit).toHaveBeenCalledExactlyOnceWith(1);
      expect(f.log.info).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining("startup completed"),
      );
    },
  );

  it("bounds hung activation by startup then shutdown deadlines", async () => {
    const f = setup({ [JobType.INGESTION]: vi.fn() });
    f.config.STARTUP_TIMEOUT_MS = 50;
    f.config.SHUTDOWN_TIMEOUT_MS = 100;
    f.consumer.waitForInitialActivation.mockReturnValue(new Promise(() => {}));
    f.consumer.stop.mockReturnValue(new Promise(() => {}));
    const worker = f.run();
    const ready = vi.fn();
    void worker.ready.then(ready);
    await vi.advanceTimersByTimeAsync(49);
    expect(ready).not.toHaveBeenCalled();
    expect(f.consumer.stop).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(f.log.error).toHaveBeenCalledWith(
      { stage: "consumer activation" },
      "worker startup deadline expired",
    );
    expect(f.consumer.stop).toHaveBeenCalledOnce();
    expect(await worker.ready).toBe(false);
    await vi.advanceTimersByTimeAsync(99);
    expect(f.dependencies.exit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await worker.stopped;
    expect(f.database.close).not.toHaveBeenCalled();
    expect(f.storage.close).not.toHaveBeenCalled();
    expect(f.dependencies.exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stops pending activation on SIGTERM and never reports late readiness", async () => {
    const f = setup({ [JobType.INGESTION]: vi.fn() });
    const activation = deferred();
    const draining = deferred();
    f.consumer.waitForInitialActivation.mockReturnValue(activation.promise);
    f.consumer.stop.mockImplementation(() => {
      f.order.push("consumer.stop");
      return draining.promise;
    });
    const worker = f.run();
    await vi.advanceTimersByTimeAsync(0);
    f.signals.emit("SIGTERM");
    await vi.advanceTimersByTimeAsync(f.config.STARTUP_TIMEOUT_MS + 1);
    expect(f.consumer.stop).toHaveBeenCalledOnce();
    expect(await worker.ready).toBe(false);
    expect(f.database.close).not.toHaveBeenCalled();
    expect(f.dependencies.exit).not.toHaveBeenCalled();
    expect(f.log.error).not.toHaveBeenCalled();
    activation.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(f.database.close).not.toHaveBeenCalled();
    expect(f.log.info).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("startup completed"),
    );
    draining.resolve();
    await worker.stopped;
    expect(f.order.slice(-3)).toEqual(["consumer.stop", "storage.close", "database.close"]);
    expect(f.dependencies.exit).toHaveBeenCalledExactlyOnceWith(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([{ [JobType.INGESTION]: undefined }, { unknown: vi.fn() } as WorkerHandlers])(
    "rejects incomplete or unknown handler registrations before connecting the broker",
    async (handlers) => {
      const f = setup(handlers);
      const worker = f.run();
      expect(await worker.ready).toBe(false);
      await worker.stopped;
      expect(f.dependencies.openConsumer).not.toHaveBeenCalled();
      expect(f.database.close).toHaveBeenCalledOnce();
      expect(f.dependencies.exit).toHaveBeenCalledExactlyOnceWith(1);
    },
  );

  it.each([
    "openDatabase",
    "check",
    "openStorage",
    "createRuntime",
    "createHandlers",
    "openConsumer",
    "registerJobHandler",
    "start",
    "waitForInitialActivation",
  ] as const)("cleans up after %s fails without logging the error", async (stage) => {
    const f = setup({ [JobType.INGESTION]: vi.fn() });
    const failure = () => {
      throw new Error("amqp://user:super-secret@host");
    };
    if (
      stage === "openDatabase" ||
      stage === "createHandlers" ||
      stage === "openConsumer" ||
      stage === "openStorage"
    ) {
      f.dependencies[stage].mockImplementation(failure);
    } else if (stage === "check" || stage === "createRuntime") {
      f.database[stage].mockImplementation(failure);
    } else {
      f.consumer[stage].mockImplementation(failure);
    }
    const worker = f.run();
    expect(await worker.ready).toBe(false);
    await worker.stopped;
    expect(f.dependencies.exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(f.database.close).toHaveBeenCalledTimes(stage === "openDatabase" ? 0 : 1);
    expect(f.storage.close).toHaveBeenCalledTimes(
      stage === "openDatabase" || stage === "check" || stage === "openStorage" ? 0 : 1,
    );
    expect(f.consumer.stop).toHaveBeenCalledTimes(
      stage === "registerJobHandler" || stage === "start" || stage === "waitForInitialActivation"
        ? 1
        : 0,
    );
    expect(JSON.stringify(f.log)).not.toContain("super-secret");
    expect(JSON.stringify(f.log.error.mock.calls)).not.toContain("super-secret");
  });

  it.each(["SIGINT", "SIGTERM"])(
    "handles %s once and preserves other listeners",
    async (signal) => {
      const f = setup();
      const other = vi.fn();
      f.signals.on(signal, other);
      const worker = f.run();
      await worker.ready;
      f.signals.emit(signal);
      f.signals.emit(signal);
      const first = worker.shutdown();
      expect(worker.shutdown()).toBe(first);
      await worker.stopped;
      expect(f.consumer.stop).toHaveBeenCalledOnce();
      expect(f.database.close).toHaveBeenCalledOnce();
      expect(f.dependencies.exit).toHaveBeenCalledExactlyOnceWith(0);
      expect(f.signals.listeners(signal)).toEqual([other]);
    },
  );

  it("handles a signal before startup acquisition", async () => {
    const f = setup();
    const worker = f.run();
    f.signals.emit("SIGTERM");
    expect(await worker.ready).toBe(false);
    await worker.stopped;
    expect(f.dependencies.openDatabase).not.toHaveBeenCalled();
    expect(f.dependencies.exit).toHaveBeenCalledExactlyOnceWith(0);
  });

  it.each(["database", "storage", "handlers"] as const)(
    "does not advance startup after a signal inside %s construction",
    async (stage) => {
      const f = setup();
      if (stage === "database") {
        f.dependencies.openDatabase.mockImplementation(() => {
          f.signals.emit("SIGTERM");
          return f.database;
        });
      } else if (stage === "storage") {
        f.dependencies.openStorage.mockImplementation(() => {
          f.signals.emit("SIGTERM");
          return f.storage;
        });
      } else {
        f.dependencies.createHandlers.mockImplementation(() => {
          f.signals.emit("SIGTERM");
          return {};
        });
      }
      const worker = f.run();
      expect(await worker.ready).toBe(false);
      await worker.stopped;
      if (stage === "database") expect(f.database.check).not.toHaveBeenCalled();
      expect(f.dependencies.openConsumer).not.toHaveBeenCalled();
      expect(f.database.close).toHaveBeenCalledOnce();
      expect(f.storage.close).toHaveBeenCalledTimes(stage === "database" ? 0 : 1);
      expect(f.dependencies.exit).toHaveBeenCalledExactlyOnceWith(0);
    },
  );

  it("waits for an in-flight database check before closing and never opens a consumer", async () => {
    const f = setup();
    const checking = deferred();
    f.database.check.mockReturnValue(checking.promise);
    const worker = f.run();
    await vi.advanceTimersByTimeAsync(0);
    f.signals.emit("SIGINT");
    expect(f.database.close).not.toHaveBeenCalled();
    checking.resolve();
    await worker.stopped;
    expect(f.dependencies.openConsumer).not.toHaveBeenCalled();
    expect(f.database.close).toHaveBeenCalledOnce();
    expect(await worker.ready).toBe(false);
  });

  it("owns a consumer acquired after a signal and stops it without activating", async () => {
    const f = setup({ [JobType.INGESTION]: vi.fn() });
    const connecting = deferred<typeof f.consumer>();
    f.dependencies.openConsumer.mockReturnValue(connecting.promise);
    const worker = f.run();
    await vi.advanceTimersByTimeAsync(0);
    f.signals.emit("SIGTERM");
    expect(f.database.close).not.toHaveBeenCalled();
    connecting.resolve(f.consumer);
    await worker.stopped;
    expect(f.consumer.start).not.toHaveBeenCalled();
    expect(f.order.slice(-3)).toEqual(["consumer.stop", "storage.close", "database.close"]);
    expect(await worker.ready).toBe(false);
  });

  it("retains storage and database resources until active work drains", async () => {
    const f = setup();
    const draining = deferred();
    f.consumer.stop.mockReturnValue(draining.promise);
    const worker = f.run();
    await worker.ready;
    void worker.shutdown();
    await vi.advanceTimersByTimeAsync(0);
    expect(f.consumer.stop).toHaveBeenCalledOnce();
    expect(f.database.close).not.toHaveBeenCalled();
    expect(f.storage.close).not.toHaveBeenCalled();
    draining.resolve();
    await worker.stopped;
    expect(f.database.close).toHaveBeenCalledOnce();
    expect(f.storage.close).toHaveBeenCalledOnce();
  });

  it.each([
    "pending check",
    "pending acquisition",
    "pending drain",
    "pending close",
    "failed drain",
  ])("forces exit at the default deadline despite %s", async (blocked) => {
    const f = setup();
    const pending = deferred();
    const connecting = deferred<typeof f.consumer>();
    if (blocked === "pending check") f.database.check.mockReturnValue(pending.promise);
    if (blocked === "pending acquisition")
      f.dependencies.openConsumer.mockReturnValue(connecting.promise);
    if (blocked === "pending drain") f.consumer.stop.mockReturnValue(pending.promise);
    if (blocked === "pending close") f.database.close.mockReturnValue(pending.promise);
    if (blocked === "failed drain") f.consumer.stop.mockRejectedValue(new Error("secret"));
    const worker = f.run();
    await vi.advanceTimersByTimeAsync(0);
    f.signals.emit("SIGTERM");
    await vi.advanceTimersByTimeAsync(59_999);
    expect(f.dependencies.exit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await worker.stopped;
    expect(f.dependencies.exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(f.log.fatal).toHaveBeenCalledWith(expect.stringContaining("deadline expired"));
    if (blocked !== "pending close") {
      expect(f.database.close).not.toHaveBeenCalled();
      expect(f.storage.close).not.toHaveBeenCalled();
    }
    pending.resolve();
    connecting.resolve(f.consumer);
    await vi.advanceTimersByTimeAsync(0);
    expect(f.dependencies.exit).toHaveBeenCalledOnce();
    if (blocked !== "pending close") expect(f.storage.close).not.toHaveBeenCalled();
    if (blocked === "pending check" || blocked === "pending acquisition") {
      expect(f.log.info).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining("startup completed"),
      );
    }
  });

  it("bounds hung startup even without a signal", async () => {
    const f = setup();
    f.config.STARTUP_TIMEOUT_MS = 50;
    f.config.SHUTDOWN_TIMEOUT_MS = 100;
    f.database.check.mockReturnValue(new Promise(() => {}));
    const worker = f.run();
    await vi.advanceTimersByTimeAsync(50);
    expect(f.log.error).toHaveBeenCalledWith(
      { stage: "database connectivity and migrations" },
      "worker startup deadline expired",
    );
    await vi.advanceTimersByTimeAsync(100);
    await worker.stopped;
    expect(f.dependencies.exit).toHaveBeenCalledExactlyOnceWith(1);
  });

  it("preserves failure status when acquisition rejects after a signal", async () => {
    const f = setup();
    const connecting = deferred<typeof f.consumer>();
    f.dependencies.openConsumer.mockReturnValue(connecting.promise);
    const worker = f.run();
    await vi.advanceTimersByTimeAsync(0);
    void worker.shutdown();
    connecting.reject(new Error("secret"));
    await worker.stopped;
    expect(f.dependencies.exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(f.database.close).toHaveBeenCalledOnce();
  });

  it.each(["resolve", "reject"] as const)(
    "treats unexpected consumer lifetime %s as fatal",
    async (outcome) => {
      const f = setup({ [JobType.INGESTION]: vi.fn() });
      const worker = f.run();
      await worker.ready;
      if (outcome === "resolve") f.lifetime.resolve();
      else f.lifetime.reject(new Error("secret"));
      await worker.stopped;
      expect(f.dependencies.exit).toHaveBeenCalledExactlyOnceWith(1);
    },
  );

  it("does not report startup success on immediate lifetime rejection", async () => {
    const f = setup({ [JobType.INGESTION]: vi.fn() });
    f.consumer.start.mockImplementation(() => Promise.reject(new Error("secret")));
    const worker = f.run();
    expect(await worker.ready).toBe(false);
    await worker.stopped;
    expect(f.dependencies.exit).toHaveBeenCalledExactlyOnceWith(1);
  });

  it("reports database close failure as nonzero without retrying close", async () => {
    const f = setup();
    f.database.close.mockRejectedValue(new Error("secret"));
    const worker = f.run();
    await worker.ready;
    await worker.shutdown();
    expect(f.database.close).toHaveBeenCalledOnce();
    expect(f.dependencies.exit).toHaveBeenCalledExactlyOnceWith(1);
  });

  it("still closes the database if storage close fails without exposing credentials", async () => {
    const f = setup();
    f.storage.close.mockImplementation(() => {
      throw new Error("storage-secret");
    });
    const worker = f.run();
    await worker.ready;
    await worker.shutdown();
    expect(f.storage.close).toHaveBeenCalledOnce();
    expect(f.database.close).toHaveBeenCalledOnce();
    expect(f.dependencies.exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(f.log.error).toHaveBeenCalledExactlyOnceWith("worker storage shutdown failed");
  });
});
