import { EventEmitter } from "node:events";

import { afterEach, describe, expect, it, vi } from "vitest";

import { runApi } from "./lifecycle.js";

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function fixture() {
  const app = { fetch: vi.fn() };
  const producer = { publish: vi.fn(), close: vi.fn().mockResolvedValue(undefined) };
  const relay = {
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
  };
  const http = {
    ready: Promise.resolve(),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const database = {
    destroy: vi.fn().mockResolvedValue(undefined),
  };
  const dependencies = {
    openDatabase: vi.fn(() => database as never),
    initializeApplication: vi.fn().mockResolvedValue(app),
    openProducer: vi.fn().mockResolvedValue(producer),
    createRelay: vi.fn(() => relay),
    openHttp: vi.fn((_app: typeof app, _onError: () => void) => http),
    signals: new EventEmitter(),
    exit: vi.fn(),
  };
  const logger = { info: vi.fn(), error: vi.fn(), fatal: vi.fn() };
  const start = () =>
    runApi({
      config: { STARTUP_TIMEOUT_MS: 30_000, SHUTDOWN_TIMEOUT_MS: 60_000 },
      logger,
      dependencies,
    });
  return { app, producer, relay, http, database, dependencies, logger, start };
}

afterEach(() => vi.useRealTimers());

describe("API lifecycle", () => {
  it("accepts a shutdown reason and failure code in an options object", async () => {
    const f = fixture();
    const api = f.start();
    await api.ready;
    await api.shutdown({ reason: "operator failure", code: 1 });
    expect(f.logger.info).toHaveBeenCalledWith(
      { reason: "operator failure" },
      "API shutdown started",
    );
    expect(f.dependencies.exit).toHaveBeenCalledExactlyOnceWith(1);
  });

  it.each([
    "initialization",
    "producer acquisition",
    "HTTP bind",
    "relay drain",
    "producer close",
    "database close",
  ])("forces nonzero exit independently of stuck %s promises", async (stage) => {
    vi.useFakeTimers();
    const f = fixture();
    const pending = new Promise<never>(() => {});
    if (stage === "initialization") f.dependencies.initializeApplication.mockReturnValue(pending);
    if (stage === "producer acquisition") f.dependencies.openProducer.mockReturnValue(pending);
    if (stage === "HTTP bind") {
      f.http.ready = pending;
      f.http.close.mockReturnValue(pending);
    }
    if (stage === "relay drain") f.relay.stop.mockReturnValue(pending);
    if (stage === "producer close") f.producer.close.mockReturnValue(pending);
    if (stage === "database close") f.database.destroy.mockReturnValue(pending);
    const api = f.start();
    await vi.advanceTimersByTimeAsync(0);
    if (["initialization", "producer acquisition", "HTTP bind"].includes(stage)) {
      await vi.advanceTimersByTimeAsync(30_000);
      expect(await api.ready).toBe(false);
    } else {
      expect(await api.ready).toBe(true);
      void api.shutdown();
    }
    await vi.advanceTimersByTimeAsync(59_999);
    expect(f.dependencies.exit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await api.stopped;
    expect(f.dependencies.exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(f.logger.fatal).toHaveBeenCalledOnce();
    if (stage === "relay drain") {
      expect(f.producer.close).not.toHaveBeenCalled();
      expect(f.database.destroy).not.toHaveBeenCalled();
    }
  });

  it.each([
    "database",
    "initialization",
    "producer",
    "relay creation",
    "relay start",
    "HTTP creation",
    "HTTP readiness",
  ])(
    "cleans up acquired resources after %s startup failure without logging credentials",
    async (stage) => {
      const f = fixture();
      const error = new Error("amqp://user:secret@broker");
      if (stage === "database")
        f.dependencies.openDatabase.mockImplementation(() => {
          throw error;
        });
      if (stage === "initialization") f.dependencies.initializeApplication.mockRejectedValue(error);
      if (stage === "producer") f.dependencies.openProducer.mockRejectedValue(error);
      if (stage === "relay creation")
        f.dependencies.createRelay.mockImplementation(() => {
          throw error;
        });
      if (stage === "relay start") f.relay.start.mockRejectedValue(error);
      if (stage === "HTTP creation")
        f.dependencies.openHttp.mockImplementation(() => {
          throw error;
        });
      if (stage === "HTTP readiness") {
        f.dependencies.openHttp.mockImplementation(() => ({
          ...f.http,
          ready: Promise.reject(error),
        }));
      }
      const api = f.start();
      expect(await api.ready).toBe(false);
      await api.stopped;
      expect(f.database.destroy).toHaveBeenCalledTimes(stage === "database" ? 0 : 1);
      expect(f.producer.close).toHaveBeenCalledTimes(
        ["database", "initialization", "producer"].includes(stage) ? 0 : 1,
      );
      expect(f.relay.stop).toHaveBeenCalledTimes(
        ["relay start", "HTTP creation", "HTTP readiness"].includes(stage) ? 1 : 0,
      );
      expect(f.http.close).toHaveBeenCalledTimes(stage === "HTTP readiness" ? 1 : 0);
      expect(f.dependencies.exit).toHaveBeenCalledExactlyOnceWith(1);
      expect(JSON.stringify(f.logger.error.mock.calls)).not.toContain("secret");
    },
  );

  it.each(["relay activation", "HTTP readiness"])(
    "interrupts pending %s to stop owned resources",
    async (stage) => {
      const f = fixture();
      const pending = new Promise<never>(() => {});
      if (stage === "relay activation") f.relay.start.mockReturnValue(pending);
      else f.http.ready = pending;
      const api = f.start();
      await vi.waitFor(() =>
        expect(
          stage === "relay activation" ? f.relay.start : f.dependencies.openHttp,
        ).toHaveBeenCalledOnce(),
      );
      f.dependencies.signals.emit("SIGTERM");
      await api.stopped;
      expect(await api.ready).toBe(false);
      expect(f.relay.stop).toHaveBeenCalledOnce();
      expect(f.http.close).toHaveBeenCalledTimes(stage === "HTTP readiness" ? 1 : 0);
      expect(f.producer.close).toHaveBeenCalledOnce();
      expect(f.database.destroy).toHaveBeenCalledOnce();
    },
  );

  it("owns HTTP errors after readiness and cleans up even when relay stop throws", async () => {
    const f = fixture();
    f.relay.stop.mockImplementation(() => {
      throw new Error("relay stop failed");
    });
    const api = f.start();
    expect(await api.ready).toBe(true);
    f.dependencies.openHttp.mock.calls[0]![1]();
    await api.stopped;
    expect(f.http.close).toHaveBeenCalledOnce();
    expect(f.producer.close).toHaveBeenCalledOnce();
    expect(f.database.destroy).toHaveBeenCalledOnce();
    expect(f.dependencies.exit).toHaveBeenCalledExactlyOnceWith(1);
  });

  it("handles signals before acquisition and while acquiring a producer without starting more work", async () => {
    const early = fixture();
    const earlyApi = early.start();
    early.dependencies.signals.emit("SIGTERM");
    await earlyApi.stopped;
    expect(await earlyApi.ready).toBe(false);
    expect(early.dependencies.openDatabase).not.toHaveBeenCalled();

    const f = fixture();
    const acquired = deferred<typeof f.producer>();
    f.dependencies.openProducer.mockReturnValue(acquired.promise);
    const api = f.start();
    await vi.waitFor(() => expect(f.dependencies.openProducer).toHaveBeenCalledOnce());
    f.dependencies.signals.emit("SIGINT");
    expect(await api.ready).toBe(false);
    expect(f.database.destroy).not.toHaveBeenCalled();
    acquired.resolve(f.producer);
    await api.stopped;
    expect(f.dependencies.createRelay).not.toHaveBeenCalled();
    expect(f.dependencies.openHttp).not.toHaveBeenCalled();
    expect(f.producer.close).toHaveBeenCalledOnce();
    expect(f.database.destroy).toHaveBeenCalledOnce();
  });

  it("stops HTTP and relay concurrently, retains dependencies until both settle, and cleans up after failures", async () => {
    const f = fixture();
    const drained = deferred();
    f.relay.stop.mockReturnValue(drained.promise);
    f.http.close.mockRejectedValue(new Error("HTTP close failed"));
    f.producer.close.mockRejectedValue(new Error("producer close failed"));
    const api = f.start();
    await api.ready;
    f.dependencies.signals.emit("SIGTERM");
    f.dependencies.signals.emit("SIGTERM");
    f.dependencies.signals.emit("SIGINT");
    expect(api.shutdown()).toBe(api.stopped);
    await vi.waitFor(() => expect(f.relay.stop).toHaveBeenCalledOnce());
    expect(f.http.close).toHaveBeenCalledOnce();
    expect(f.producer.close).not.toHaveBeenCalled();
    expect(f.database.destroy).not.toHaveBeenCalled();
    drained.resolve();
    await api.stopped;
    expect(f.producer.close).toHaveBeenCalledOnce();
    expect(f.database.destroy).toHaveBeenCalledOnce();
    expect(f.dependencies.exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(f.dependencies.signals.listenerCount("SIGTERM")).toBe(0);
  });

  it("initializes before composing one relay and reporting HTTP readiness", async () => {
    const f = fixture();
    const initialized = deferred<typeof f.app>();
    const listening = deferred();
    f.dependencies.initializeApplication.mockReturnValue(initialized.promise);
    f.http.ready = listening.promise;
    const api = f.start();
    await vi.waitFor(() =>
      expect(f.dependencies.initializeApplication).toHaveBeenCalledExactlyOnceWith(f.database),
    );
    expect(f.dependencies.openProducer).not.toHaveBeenCalled();
    initialized.resolve(f.app);
    await vi.waitFor(() =>
      expect(f.dependencies.openHttp).toHaveBeenCalledExactlyOnceWith(f.app, expect.any(Function)),
    );
    expect(f.dependencies.createRelay).toHaveBeenCalledExactlyOnceWith(f.database, f.producer);
    expect(f.relay.start).toHaveBeenCalledOnce();
    expect(f.logger.info).not.toHaveBeenCalledWith("API startup completed");
    listening.resolve();
    expect(await api.ready).toBe(true);
    await api.shutdown();
    expect(f.http.close).toHaveBeenCalledOnce();
    expect(f.relay.stop).toHaveBeenCalledOnce();
    expect(f.producer.close).toHaveBeenCalledOnce();
    expect(f.database.destroy).toHaveBeenCalledOnce();
    expect(f.dependencies.exit).toHaveBeenCalledExactlyOnceWith(0);
  });
});
