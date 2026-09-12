import { EventEmitter } from "node:events";

import { describe, expect, it, vi } from "vitest";

import { bootstrapWorker } from "./bootstrap.js";

import type { BackendRuntime } from "@exposurenexus/backend";
import type { Logger } from "pino";

function setup() {
  const environment = {
    DATABASE_URL: "postgres://user:secret@localhost/db",
    RABBITMQ_URL: "amqp://worker:secret@localhost",
    RABBITMQ_QUEUE: "worker-queue",
    STARTUP_TIMEOUT_MS: "1234",
    LOG_LEVEL: "debug",
    AUTH_SECRET: "invalid-but-irrelevant",
  };
  const log = { info: vi.fn(), error: vi.fn(), fatal: vi.fn() };
  const logger = log as unknown as Logger;
  const hooks = { signals: new EventEmitter(), exit: vi.fn() };
  const database = {
    check: vi.fn(async () => {}),
    createRuntime: vi.fn(() => ({}) as BackendRuntime),
    close: vi.fn(async () => {}),
  };
  const consumer = {
    start: vi.fn(),
    waitForInitialActivation: vi.fn(),
    registerJobHandler: vi.fn(),
    stop: vi.fn(async () => {}),
  };
  const factories = {
    createLogger: vi.fn(() => logger),
    openDatabase: vi.fn(() => database),
    createJobConsumer: vi.fn(async () => consumer),
  };
  return {
    environment,
    log,
    logger,
    hooks,
    database,
    consumer,
    factories,
    run: () => bootstrapWorker(environment, hooks, factories),
  };
}

describe("worker bootstrap", () => {
  it("composes configured dependencies and stays idle with no production handlers", async () => {
    const f = setup();
    const worker = f.run()!;
    expect(await worker.ready).toBe(true);
    expect(f.factories.createLogger.mock.calls).toEqual([[], ["debug"]]);
    expect(f.factories.openDatabase).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ DATABASE_URL: f.environment.DATABASE_URL }),
      f.logger,
    );
    expect(f.database.check).toHaveBeenCalledOnce();
    expect(f.database.createRuntime).toHaveBeenCalledOnce();
    expect(f.factories.createJobConsumer).toHaveBeenCalledExactlyOnceWith({
      connectionOptions: f.environment.RABBITMQ_URL,
      queueName: "worker-queue",
      socketOptions: { timeout: 1234 },
      logger: f.logger,
    });
    expect(f.consumer.start).not.toHaveBeenCalled();
    expect(f.consumer.registerJobHandler).not.toHaveBeenCalled();
    f.hooks.signals.emit("SIGTERM");
    await worker.stopped;
    expect(f.consumer.stop).toHaveBeenCalledOnce();
    expect(f.database.close).toHaveBeenCalledOnce();
    expect(f.hooks.exit).toHaveBeenCalledExactlyOnceWith(0);
  });

  it.each([
    [{ DATABASE_URL: "not-a-url-with-secret" }, "DATABASE_URL"],
    [
      { DATABASE_URL: "", RABBITMQ_URL: "", LOG_LEVEL: "secret-invalid-level" },
      "DATABASE_URL, RABBITMQ_URL, LOG_LEVEL",
    ],
  ])("rejects invalid configuration before acquiring resources", (invalid, fields) => {
    const f = setup();
    Object.assign(f.environment, invalid);
    expect(f.run()).toBeUndefined();
    expect(f.factories.openDatabase).not.toHaveBeenCalled();
    expect(f.factories.createJobConsumer).not.toHaveBeenCalled();
    expect(f.hooks.exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(f.log.fatal).toHaveBeenCalledExactlyOnceWith(`Invalid worker configuration: ${fields}`);
    expect(JSON.stringify(f.log.fatal.mock.calls)).not.toContain("secret");
  });

  it("does not expose arbitrary bootstrap errors resembling validation errors", () => {
    const f = setup();
    f.factories.createLogger
      .mockImplementationOnce(() => f.logger)
      .mockImplementationOnce(() => {
        throw new Error("Invalid worker configuration: amqp://user:secret@host");
      });
    expect(f.run()).toBeUndefined();
    expect(f.hooks.exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(f.log.fatal).toHaveBeenCalledExactlyOnceWith(
      "worker configuration or bootstrap failed; check required worker settings",
    );
    expect(f.factories.openDatabase).not.toHaveBeenCalled();
  });
});
