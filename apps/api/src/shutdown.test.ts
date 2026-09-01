import { describe, expect, it, vi } from "vitest";

import { createApiShutdown } from "./shutdown.js";

describe("API shutdown", () => {
  it("closes the server and owned pool once across concurrent signals", async () => {
    let completeServerClose!: (error?: Error) => void;
    const server = {
      close: vi.fn((callback: (error?: Error) => void) => {
        completeServerClose = callback;
      }),
    };
    const pool = {
      end: vi.fn().mockResolvedValue(undefined),
    };
    const info = vi.fn();
    const logger = { info } as never;
    const shutdown = createApiShutdown(server, pool, logger);

    const firstShutdown = shutdown("SIGTERM");
    const secondShutdown = shutdown("SIGINT");

    expect(secondShutdown).toBe(firstShutdown);
    expect(server.close).toHaveBeenCalledOnce();
    expect(pool.end).not.toHaveBeenCalled();

    completeServerClose();
    await firstShutdown;

    expect(pool.end).toHaveBeenCalledOnce();
    expect(info).toHaveBeenCalledWith({ signal: "SIGTERM" }, "shutting down API");
  });

  it("still closes the pool when closing the server fails", async () => {
    const closeError = new Error("server close failed");
    const server = {
      close: vi.fn((callback: (error?: Error) => void) => {
        callback(closeError);
      }),
    };
    const pool = {
      end: vi.fn().mockResolvedValue(undefined),
    };
    const shutdown = createApiShutdown(server, pool, { info: vi.fn() } as never);

    await expect(shutdown("SIGTERM")).rejects.toBe(closeError);
    expect(pool.end).toHaveBeenCalledOnce();
  });
});
