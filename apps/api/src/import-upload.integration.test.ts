/// <reference lib="es2024.promise" />

import { once } from "node:events";
import { request } from "node:http";
import { addAbortSignal, Readable } from "node:stream";
import { buffer, json } from "node:stream/consumers";
import { setImmediate } from "node:timers/promises";

import { serve } from "@hono/node-server";
import { describe, expect, it, onTestFinished, vi } from "vitest";

import { createRequireDomainPermission } from "./middleware/auth.js";
import { createImportRoute } from "./routes/import.js";
import {
  annotateAuthenticatedUser,
  createTestApp,
  createTestUser,
  requireAuthenticatedUser,
} from "./test/app.js";

import type { Ingestions } from "@exposurenexus/backend/ingestions";
import type { IncomingMessage, OutgoingHttpHeaders } from "node:http";

const user = createTestUser();
const importSourceId = "6b80ec81-bfa7-435c-b41e-8d14510b5ee2";
const accepted = {
  importSourceId,
  ingestionId: "97ce97b1-e994-4787-895c-23489e5cd337",
  jobId: "a1f3c2f0-abcf-44da-83e1-2d715f6fb86c",
};

async function startUpload(submit: Ingestions["submit"], headers: OutgoingHttpHeaders = {}) {
  const userHasPermission = vi.fn().mockResolvedValue(true);
  const app = createTestApp({
    annotateAuth: annotateAuthenticatedUser(user),
    requireAuth: requireAuthenticatedUser,
    importerRoute: createImportRoute(
      { register: vi.fn() },
      {
        requireDomainPermission: createRequireDomainPermission(userHasPermission),
        ingestions: { submit },
      },
    ),
  });
  const listening = Promise.withResolvers<{ port: number }>();
  const socketClosed = Promise.withResolvers<void>();
  const server = serve({ fetch: app.fetch, hostname: "127.0.0.1", port: 0 }, listening.resolve);
  server.once("error", listening.reject);
  server.once("connection", (socket) => socket.once("close", () => socketClosed.resolve()));
  onTestFinished(async () => {
    await app.closeUploads();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  const { port } = await listening.promise;
  const client = request(`http://127.0.0.1:${port}/api/findings/import/${importSourceId}/content`, {
    method: "PUT",
    agent: false,
    headers: { "X-Request-Id": "node-upload", ...headers },
  });
  // Destroying a request before its response deliberately emits ECONNRESET.
  client.on("error", vi.fn());
  onTestFinished(() => {
    client.destroy();
  });

  return { app, client, socketClosed: socketClosed.promise, userHasPermission };
}

describe("import uploads over real Node HTTP", () => {
  it.each([
    { phase: "while streaming an unfinished request", complete: false },
    { phase: "after consuming the full request body", complete: true },
  ])(
    "cancels on disconnect $phase and drains submission after the socket closes",
    async ({ complete }) => {
      const firstChunk = Promise.withResolvers<Parameters<Ingestions["submit"]>[0]>();
      const consumed = Promise.withResolvers<string>();
      const cancelled = Promise.withResolvers<void>();
      const readingStopped = Promise.withResolvers<void>();
      const settleSubmission = Promise.withResolvers<void>();
      const settlementOrder: string[] = [];
      let received = "";
      const submit = vi.fn<Ingestions["submit"]>(async (command) => {
        command.signal.throwIfAborted();
        command.signal.addEventListener("abort", () => cancelled.resolve(), { once: true });
        addAbortSignal(command.signal, command.body);
        try {
          for await (const chunk of command.body) {
            received += chunk.toString();
            firstChunk.resolve(command);
          }
          consumed.resolve(received);
          await cancelled.promise;
          command.signal.throwIfAborted();
          throw new Error("Submission continued after cancellation");
        } finally {
          readingStopped.resolve();
          // Cancellation stops input, but capability cleanup can still be pending.
          await settleSubmission.promise;
          settlementOrder.push("submission settled");
        }
      });
      const { app, client, socketClosed, userHasPermission } = await startUpload(submit);
      onTestFinished(() => settleSubmission.resolve());

      client.write("first chunk\n");
      const command = await firstChunk.promise;
      expect(received).toBe("first chunk\n");
      expect(command).toMatchObject({
        importSourceId,
        performedBy: user.id,
        contentLength: undefined,
      });
      expect(userHasPermission).toHaveBeenCalledExactlyOnceWith(user.id, { import: ["write"] });
      expect(command.body.readableEnded).toBe(false);

      if (complete) {
        client.end("last chunk\n");
        await expect(consumed.promise).resolves.toBe("first chunk\nlast chunk\n");
        expect(command.body.readableEnded).toBe(true);
      }
      expect(client.writableEnded).toBe(complete);
      expect(command.signal.aborted).toBe(false);
      expect(settlementOrder).toEqual([]);

      client.destroy();
      await socketClosed;
      await cancelled.promise;
      await readingStopped.promise;
      expect(command.signal.aborted).toBe(true);
      expect(command.body.destroyed).toBe(true);
      expect(command.body.readableEnded).toBe(complete);
      expect(received).toBe(complete ? "first chunk\nlast chunk\n" : "first chunk\n");

      const closing = app.closeUploads().then(() => settlementOrder.push("uploads closed"));
      // Run queued callbacks without releasing submission or relying on a timed sleep.
      await setImmediate();
      expect(settlementOrder).toEqual([]);

      settleSubmission.resolve();
      await closing;
      expect(settlementOrder).toEqual(["submission settled", "uploads closed"]);
      expect(submit).toHaveBeenCalledOnce();
    },
  );

  it.each([
    {
      transport: "chunked binary",
      headers: { "Transfer-Encoding": "chunked" },
      payload: Buffer.from([0, 255, 10, 123, 125]),
      contentLength: undefined,
    },
    {
      transport: "zero-byte",
      headers: { "Content-Length": "0" },
      payload: Buffer.alloc(0),
      contentLength: 0,
    },
  ])(
    "adapts $transport HTTP input and returns durable acceptance",
    async ({ headers, payload, contentLength }) => {
      const submit = vi.fn<Ingestions["submit"]>(async (command) => {
        command.signal.throwIfAborted();
        expect(await buffer(addAbortSignal(command.signal, command.body))).toEqual(payload);
        command.signal.throwIfAborted();
        return accepted;
      });
      const { client, userHasPermission } = await startUpload(submit, headers);
      const responseReceived = once(client, "response");
      client.write(payload.subarray(0, 2));
      client.end(payload.subarray(2));
      const [response] = (await responseReceived) as [IncomingMessage];

      expect(response.statusCode).toBe(202);
      await expect(json(response)).resolves.toEqual({
        correlationId: "node-upload",
        data: accepted,
      });
      expect(userHasPermission).toHaveBeenCalledExactlyOnceWith(user.id, { import: ["write"] });
      expect(submit).toHaveBeenCalledExactlyOnceWith({
        importSourceId,
        performedBy: user.id,
        body: expect.any(Readable),
        contentLength,
        signal: expect.any(AbortSignal),
      });
      const command = submit.mock.calls[0]![0];
      expect(command.body.destroyed).toBe(true);
      expect(command.signal.aborted).toBe(false);
    },
  );
});
