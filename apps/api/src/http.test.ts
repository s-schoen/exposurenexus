import { createServer } from "node:http";

import { serve } from "@hono/node-server";
import { beforeEach, expect, it, vi } from "vitest";

import { openHttp } from "./http.js";

vi.mock("@hono/node-server", () => ({ serve: vi.fn() }));

beforeEach(() => vi.clearAllMocks());

function fixture() {
  const server = createServer();
  const close = vi.spyOn(server, "close").mockImplementation((callback) => {
    callback?.();
    return server;
  });
  vi.mocked(serve).mockReturnValue(server);
  const fetch = vi.fn(() => new Response("ok"));
  const onError = vi.fn();
  const http = openHttp({ fetch, port: 3000, importUploadTimeoutMs: 600000, onError });
  const listen = () =>
    vi.mocked(serve).mock.calls[0]![1]?.({ port: 3000, address: "127.0.0.1", family: "IPv4" });
  return { server, close, fetch, onError, http, listen };
}

it("reports readiness only after listening and waits for HTTP close to finish", async () => {
  const f = fixture();
  const ready = vi.fn();
  void f.http.ready.then(ready);
  await Promise.resolve();
  expect(ready).not.toHaveBeenCalled();
  expect(serve).toHaveBeenCalledWith(
    { fetch: f.fetch, port: 3000, serverOptions: { requestTimeout: 660000 } },
    expect.any(Function),
  );
  f.listen();
  await expect(f.http.ready).resolves.toBeUndefined();

  f.close.mockImplementation(() => f.server);
  const closed = vi.fn();
  const closing = f.http.close().then(closed);
  await Promise.resolve();
  expect(closed).not.toHaveBeenCalled();
  f.close.mock.calls[0]![0]?.();
  await closing;
  expect(closed).toHaveBeenCalledOnce();
  expect(f.onError).not.toHaveBeenCalled();
});

it("reports a safe bind error and closes the owned server even if it never listened", async () => {
  const f = fixture();
  f.server.emit("error", new Error("EADDRINUSE credential-secret"));
  await expect(f.http.ready).rejects.toThrow("HTTP server failed");
  expect(f.onError).toHaveBeenCalledExactlyOnceWith();
  f.close.mockImplementation((callback) => {
    callback?.(Object.assign(new Error("not listening"), { code: "ERR_SERVER_NOT_RUNNING" }));
    return f.server;
  });
  await expect(f.http.close()).resolves.toBeUndefined();
  expect(f.close).toHaveBeenCalledOnce();
});

it("continues reporting HTTP errors after readiness and propagates close failures", async () => {
  const f = fixture();
  f.listen();
  await f.http.ready;
  f.server.emit("error", new Error("runtime HTTP failure"));
  expect(f.onError).toHaveBeenCalledExactlyOnceWith();
  const error = new Error("close failed");
  f.close.mockImplementation((callback) => {
    callback?.(error);
    return f.server;
  });
  await expect(f.http.close()).rejects.toBe(error);
});
