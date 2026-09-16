import { Readable } from "node:stream";
import { buffer } from "node:stream/consumers";
import { setImmediate } from "node:timers/promises";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { ApplicationError } from "../index.js";
import {
  createObjectStorage,
  type ObjectStorage,
  type ObjectStorageConfiguration,
} from "./index.js";

const configuration = {
  bucket: "private-objects",
  region: "us-east-1",
  credentials: { accessKeyId: "test", secretAccessKey: "secret-not-for-results" },
};

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

describe("object storage", () => {
  const objects = new Map<string, Buffer>();
  let storage: ObjectStorage;
  let send: MockInstance<S3Client["send"]>;

  beforeEach(() => {
    objects.clear();
    send = vi.spyOn(S3Client.prototype, "send").mockImplementation(async (command) => {
      if (command instanceof PutObjectCommand) {
        objects.set(command.input.Key!, await buffer(command.input.Body as Readable));
        return {};
      }
      if (command instanceof GetObjectCommand) {
        const bytes = objects.get(command.input.Key!);
        if (!bytes) throw new Error("NoSuchKey");
        return { Body: Readable.from([bytes]) };
      }
      if (command instanceof DeleteObjectCommand) {
        objects.delete(command.input.Key!);
        return {};
      }
      throw new Error("Unexpected S3 operation");
    });
    storage = createObjectStorage(configuration);
  });

  afterEach(() => {
    storage?.close();
    vi.restoreAllMocks();
  });

  it("round-trips streamed bytes under the caller's key in the bound bucket", async () => {
    const key = "another-capability/../caller-chosen.bin";
    await expect(
      storage.write({
        key,
        body: Readable.from([Buffer.from("hello"), new Uint8Array([0, 255])]),
        expectedSizeBytes: 7,
      }),
    ).resolves.toBeUndefined();
    expect(storage.bucket).toBe("private-objects");
    expect(await buffer(await storage.read(key))).toEqual(
      Buffer.from([104, 101, 108, 108, 111, 0, 255]),
    );
    expect(send.mock.calls.map(([command]) => command.input)).toEqual([
      { Bucket: "private-objects", Key: key, Body: expect.any(Readable), ContentLength: 7 },
      { Bucket: "private-objects", Key: key },
    ]);
    await storage.delete(key);
    await storage.delete(key);
    expect(objects.size).toBe(0);
    expect(send.mock.calls.slice(2).map(([command]) => command.input)).toEqual([
      { Bucket: "private-objects", Key: key },
      { Bucket: "private-objects", Key: key },
    ]);
  });

  it.each([
    { label: "short input at EOF", chunks: ["ab"], expectedSizeBytes: 3, actualSize: 2 },
    { label: "empty short input", chunks: [], expectedSizeBytes: 1, actualSize: 0 },
    { label: "long input", chunks: ["abcd"], expectedSizeBytes: 3, actualSize: null },
    { label: "in-flight overrun", chunks: ["ab", "cdef"], expectedSizeBytes: 4, actualSize: null },
    {
      label: "nonempty input declared empty",
      chunks: ["a"],
      expectedSizeBytes: 0,
      actualSize: null,
    },
  ])(
    "rejects $label without reporting a partial count as the full size",
    async ({ chunks, expectedSizeBytes, actualSize }) => {
      const body = Readable.from(chunks.map((chunk) => Buffer.from(chunk)));
      await expect(
        storage.write({ key: "mismatch", body, expectedSizeBytes }),
      ).rejects.toMatchObject({
        code: "object_storage.write_failed",
        kind: "unexpected",
        details: { reason: "size_mismatch", actualSize },
      });
      expect(body.destroyed).toBe(true);
      expect(send).toHaveBeenCalledTimes(1);
    },
  );

  it("accepts an empty object with an exact zero-byte declaration", async () => {
    await storage.write({ key: "empty", body: Readable.from([]), expectedSizeBytes: 0 });
    expect(await buffer(await storage.read("empty"))).toEqual(Buffer.alloc(0));
  });

  it.each([null, {}, { aborted: false }])(
    "rejects invalid cancellation signal %j before transfer",
    async (signal) => {
      const body = Readable.from([]);
      try {
        await expect(
          storage.write({
            key: "invalid-signal",
            body,
            expectedSizeBytes: 0,
            signal: signal as never,
          }),
        ).rejects.toMatchObject({ code: "object_storage.invalid_input" });
        expect(body.readableDidRead).toBe(false);
        expect(send).not.toHaveBeenCalled();
      } finally {
        body.destroy();
      }
    },
  );

  it("does not contact S3 for an already cancelled write", async () => {
    const body = new Readable({ read() {} });
    await expect(
      storage.write({ key: "cancelled", body, expectedSizeBytes: 3, signal: AbortSignal.abort() }),
    ).rejects.toMatchObject({
      code: "object_storage.write_failed",
      details: { reason: "transfer_failed", actualSize: null },
    });
    expect(body.destroyed).toBe(true);
    expect(send).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    "cancels the SDK request and waits for settlement (input EOF: %s)",
    async (eof) => {
      const ready = deferred();
      const released = deferred();
      send.mockImplementationOnce(async (request) => {
        if (eof) await buffer((request as PutObjectCommand).input.Body as Readable);
        ready.resolve();
        await released.promise;
        throw new Error("cancelled SDK request settled");
      });
      const controller = new AbortController();
      const body = eof
        ? Readable.from([Buffer.from("abc")])
        : new Readable({ read() {}, emitClose: false });
      const settled = vi.fn();
      const result = storage.write({
        key: "cancelled-upload",
        body,
        expectedSizeBytes: 3,
        signal: controller.signal,
      });
      void result.then(settled, settled);
      try {
        await ready.promise;
        controller.abort();
        await setImmediate();
        const options = send.mock.calls[0]![1] as { abortSignal: AbortSignal };
        expect(options.abortSignal.aborted).toBe(true);
        expect(body.destroyed).toBe(true);
        expect(settled).not.toHaveBeenCalled();
      } finally {
        released.resolve();
        await result.catch(() => {});
      }
      await expect(result).rejects.toMatchObject({
        code: "object_storage.write_failed",
        details: { reason: "transfer_failed", actualSize: eof ? 3 : null },
      });
    },
  );

  it.each([-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, undefined, null, "1"])(
    "rejects invalid declared length %s before transfer and leaves input with the caller",
    async (expectedSizeBytes) => {
      const body = Readable.from([Buffer.from("unused")]);
      try {
        await expect(
          storage.write({ key: "invalid", body, expectedSizeBytes: expectedSizeBytes as never }),
        ).rejects.toMatchObject({ code: "object_storage.invalid_input", kind: "validation" });
        expect(body.readableDidRead).toBe(false);
        expect(body.destroyed).toBe(false);
        expect(send).not.toHaveBeenCalled();
      } finally {
        body.destroy();
      }
    },
  );

  it.each([undefined, null, Buffer.from("not a stream"), {}, new WritableStream()])(
    "rejects non-readable input %s before contacting storage",
    async (body) => {
      await expect(
        storage.write({ key: "invalid", body: body as never, expectedSizeBytes: 0 }),
      ).rejects.toMatchObject({ code: "object_storage.invalid_input", kind: "validation" });
      expect(send).not.toHaveBeenCalled();
    },
  );

  it("rejects destroyed and exhausted streams before contacting storage", async () => {
    const destroyed = new Readable({ read() {} });
    destroyed.destroy();
    const exhausted = Readable.from([]);
    await buffer(exhausted);
    for (const body of [destroyed, exhausted]) {
      await expect(
        storage.write({ key: "invalid", body, expectedSizeBytes: 0 }),
      ).rejects.toMatchObject({
        code: "object_storage.invalid_input",
        kind: "validation",
      });
    }
    expect(send).not.toHaveBeenCalled();
  });

  it.each([
    { bucket: "" },
    { bucket: "  " },
    { region: "" },
    { region: "  " },
    { credentials: { accessKeyId: "", secretAccessKey: "secret-not-for-results" } },
    { credentials: { accessKeyId: "  ", secretAccessKey: "secret-not-for-results" } },
    { credentials: { accessKeyId: "test", secretAccessKey: "" } },
    { credentials: { accessKeyId: "test", secretAccessKey: "  " } },
    { endpoint: "" },
    { endpoint: "not a URL" },
    { endpoint: "file:///private" },
  ] satisfies Partial<ObjectStorageConfiguration>[])(
    "rejects invalid configuration %j without contacting storage",
    (overrides) => {
      expect(() => createObjectStorage({ ...configuration, ...overrides })).toThrow(
        expect.objectContaining({
          code: "object_storage.invalid_configuration",
          kind: "validation",
        }),
      );
      expect(send).not.toHaveBeenCalled();
    },
  );

  it("preserves explicit SDK settings without a startup request", async () => {
    const config: ObjectStorageConfiguration = {
      ...configuration,
      endpoint: "http://s3.example.test:7070",
      forcePathStyle: true,
    };
    const handle = createObjectStorage(config);
    try {
      expect(send).not.toHaveBeenCalled();
      config.bucket = "different-bucket";
      config.region = "different-region";
      config.endpoint = "https://different-service.example.test";
      config.forcePathStyle = false;
      expect(handle.bucket).toBe("private-objects");
      expect(Reflect.set(handle, "bucket", "different-bucket")).toBe(false);
      await handle.delete("caller-key");
      const client = send.mock.contexts[0] as S3Client;
      expect(await client.config.region()).toBe("us-east-1");
      expect(await client.config.credentials()).toMatchObject(configuration.credentials);
      expect(await client.config.endpoint?.()).toMatchObject({
        protocol: "http:",
        hostname: "s3.example.test",
        port: 7070,
      });
      expect(client.config.forcePathStyle).toBe(true);
      expect(await client.config.maxAttempts()).toBe(1);
      expect(await client.config.requestChecksumCalculation()).toBe("WHEN_REQUIRED");
      expect(await client.config.responseChecksumValidation()).toBe("WHEN_REQUIRED");
      expect(send.mock.calls[0]![0].input).toEqual({
        Bucket: "private-objects",
        Key: "caller-key",
      });
    } finally {
      handle.close();
    }
  });

  it("snapshots static credentials so later mutation cannot change the storage account", async () => {
    const credentials = { ...configuration.credentials };
    const handle = createObjectStorage({ ...configuration, credentials });
    try {
      credentials.accessKeyId = "different-account";
      credentials.secretAccessKey = "different-secret";
      await handle.delete("snapshot");
      const client = send.mock.contexts[0] as S3Client;
      expect(await client.config.credentials()).toMatchObject(configuration.credentials);
    } finally {
      handle.close();
    }
  });

  it.each(["read", "delete"] as const)(
    "reports a sanitized typed %s failure",
    async (operation) => {
      send.mockRejectedValueOnce(new Error("SDK failure: secret-not-for-results"));
      const error = await storage[operation]("key").catch((error: unknown) => error);
      expect(error).toBeInstanceOf(ApplicationError);
      expect(error).toMatchObject({
        code: `object_storage.${operation}_failed`,
        kind: "unexpected",
        cause: undefined,
        details: undefined,
      });
      expect(String(error)).not.toContain("secret-not-for-results");
      expect(JSON.stringify(error)).not.toContain("secret-not-for-results");
      expect(send).toHaveBeenCalledTimes(1);
    },
  );

  it("rejects a missing object rather than returning an empty stream", async () => {
    await expect(storage.read("missing")).rejects.toMatchObject({
      code: "object_storage.read_failed",
      kind: "unexpected",
    });
  });

  it.each([undefined, null, Buffer.alloc(0), "not readable"])(
    "rejects an unreadable response body %s",
    async (Body) => {
      send.mockImplementationOnce(async () => ({ Body }));
      await expect(storage.read("missing-body")).rejects.toMatchObject({
        code: "object_storage.read_failed",
        kind: "unexpected",
      });
    },
  );

  it("returns a read stream before its bytes arrive and leaves late errors to the consumer", async () => {
    const body = new Readable({ read() {} });
    send.mockImplementationOnce(async () => ({ Body: body }));
    const readable = await storage.read("streaming");
    expect(readable).toBe(body);
    const consumed = buffer(readable);
    const error = new Error("late stream failure");
    body.destroy(error);
    await expect(consumed).rejects.toBe(error);
  });

  it("waits for input EOF even if storage acknowledges the declared bytes early", async () => {
    send.mockImplementationOnce(async () => ({}));
    const body = new Readable({ read() {} });
    const settled = vi.fn();
    const result = storage.write({ key: "pending-input", body, expectedSizeBytes: 3 });
    void result.then(settled, settled);
    body.push(Buffer.from("abc"));
    await setImmediate();
    expect(settled).not.toHaveBeenCalled();
    body.push(null);
    await expect(result).resolves.toBeUndefined();
  });

  it("waits for upload acknowledgement after consuming the complete input", async () => {
    const consumed = deferred();
    const acknowledged = deferred();
    send.mockImplementationOnce(async (command) => {
      await buffer((command as PutObjectCommand).input.Body as Readable);
      consumed.resolve();
      await acknowledged.promise;
      return {};
    });
    const settled = vi.fn();
    const result = storage.write({
      key: "pending-upload",
      body: Readable.from([Buffer.from("abc")]),
      expectedSizeBytes: 3,
    });
    void result.then(settled, settled);
    await consumed.promise;
    expect(settled).not.toHaveBeenCalled();
    acknowledged.resolve();
    await expect(result).resolves.toBeUndefined();
  });

  it("preserves backpressure and streams beyond the import-specific 100 MiB policy", async () => {
    const ready = deferred();
    let produced = 0;
    let received = 0;
    const chunk = Buffer.alloc(65536, 0x61);
    const body = Readable.from(
      (function* () {
        for (let index = 0; index < 2048; index += 1) {
          produced += 1;
          yield chunk;
        }
      })(),
      { objectMode: false },
    );
    send.mockImplementationOnce(async (command) => {
      await ready.promise;
      for await (const bytes of (command as PutObjectCommand).input.Body as Readable) {
        received += (bytes as Buffer).byteLength;
      }
      return {};
    });
    const result = storage.write({ key: "large", body, expectedSizeBytes: 134217728 });
    await setImmediate();
    expect(produced).toBeGreaterThan(0);
    expect(produced).toBeLessThan(2048);
    expect(body.readableEnded).toBe(false);
    ready.resolve();
    await result;
    expect(received).toBe(134217728);
  });

  it.each([0, 3])(
    "reports complete size %s on storage failure and leaves compensation to the caller",
    async (expectedSizeBytes) => {
      const sdk = send.getMockImplementation()!;
      send.mockImplementationOnce(async (...args) => {
        await Promise.resolve(sdk(...args));
        throw new Error("SDK failure after upload: secret-not-for-results");
      });
      const error = await storage
        .write({
          key: "ambiguous-write",
          body: Readable.from([Buffer.alloc(expectedSizeBytes, 0x61)]),
          expectedSizeBytes,
        })
        .catch((error: unknown) => error);
      expect(error).toBeInstanceOf(ApplicationError);
      expect(error).toMatchObject({
        code: "object_storage.write_failed",
        kind: "unexpected",
        details: { reason: "transfer_failed", actualSize: expectedSizeBytes },
        cause: undefined,
      });
      expect(String(error)).not.toContain("secret-not-for-results");
      expect(JSON.stringify(error)).not.toContain("secret-not-for-results");
      expect(send).toHaveBeenCalledTimes(1);
      expect(await buffer(await storage.read("ambiguous-write"))).toEqual(
        Buffer.alloc(expectedSizeBytes, 0x61),
      );
      await storage.delete("ambiguous-write");
    },
  );

  it.each([
    { label: "non-byte chunk", body: () => Readable.from([Buffer.from("a"), { not: "bytes" }]) },
    {
      label: "input error",
      body: () =>
        Readable.from(
          (async function* () {
            yield Buffer.from("a");
            throw new Error("input error: secret-not-for-results");
          })(),
        ),
    },
    {
      label: "premature closure",
      body: () =>
        new Readable({
          read() {
            this.push(Buffer.from("a"));
            this.destroy();
          },
        }),
    },
  ])(
    "rejects $label with unknown complete size and no unhandled stream error",
    async ({ body: createBody }) => {
      const body = createBody();
      await expect(
        storage.write({ key: "interrupted", body, expectedSizeBytes: 1 }),
      ).rejects.toMatchObject({
        code: "object_storage.write_failed",
        details: { reason: "transfer_failed", actualSize: null },
      });
      expect(body.destroyed).toBe(true);
      expect(send).toHaveBeenCalledTimes(1);
    },
  );

  it("cancels blocked input on storage failure and waits for pipeline destruction to settle", async () => {
    const destroying = deferred();
    const released = deferred();
    const body = new Readable({
      read() {},
      destroy(error, callback) {
        destroying.resolve();
        void released.promise.then(() => callback(error));
      },
    });
    send.mockRejectedValueOnce(new Error("storage failed before reading input"));
    const settled = vi.fn();
    const result = storage.write({
      key: "blocked",
      body,
      expectedSizeBytes: Number.MAX_SAFE_INTEGER,
    });
    void result.then(settled, settled);
    await destroying.promise;
    await setImmediate();
    expect(settled).not.toHaveBeenCalled();
    const [command, options] = send.mock.calls[0]!;
    expect((options as { abortSignal: AbortSignal }).abortSignal.aborted).toBe(true);
    expect(((command as PutObjectCommand).input.Body as Readable).destroyed).toBe(true);
    expect(body.destroyed).toBe(true);
    released.resolve();
    await expect(result).rejects.toMatchObject({
      code: "object_storage.write_failed",
      details: { reason: "transfer_failed", actualSize: null },
    });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("aborts an upload on input failure and waits for its local settlement before rejecting", async () => {
    const aborted = deferred();
    const released = deferred();
    send.mockImplementationOnce(async (_command, options) => {
      const signal = (options as { abortSignal: AbortSignal }).abortSignal;
      signal.addEventListener("abort", () => aborted.resolve(), { once: true });
      await aborted.promise;
      await released.promise;
      throw new Error("aborted upload");
    });
    const settled = vi.fn();
    const result = storage.write({
      key: "blocked-upload",
      body: Readable.from([]),
      expectedSizeBytes: 1,
    });
    void result.then(settled, settled);
    await aborted.promise;
    await setImmediate();
    expect(settled).not.toHaveBeenCalled();
    released.resolve();
    await expect(result).rejects.toMatchObject({
      code: "object_storage.write_failed",
      details: { reason: "size_mismatch", actualSize: 0 },
    });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("settles and sanitizes a synchronous storage failure", async () => {
    send.mockImplementationOnce(() => {
      throw new Error("synchronous SDK failure: secret-not-for-results");
    });
    const body = new Readable({ read() {} });
    await expect(
      storage.write({ key: "sync-failure", body, expectedSizeBytes: 1 }),
    ).rejects.toMatchObject({
      code: "object_storage.write_failed",
      details: { reason: "transfer_failed", actualSize: null },
      cause: undefined,
    });
    expect(body.destroyed).toBe(true);
  });

  it("settles storage-first cancellation even when stalled input suppresses close events", async () => {
    send.mockRejectedValueOnce(new Error("storage unavailable"));
    const body = new Readable({ read() {}, emitClose: false });
    const settled = vi.fn();
    const result = storage.write({ key: "no-close-event", body, expectedSizeBytes: 1 });
    void result.then(settled, settled);
    await setImmediate();
    expect(settled).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "object_storage.write_failed",
        details: { reason: "transfer_failed", actualSize: null },
      }),
    );
    await expect(result).rejects.toBeInstanceOf(ApplicationError);
    expect(body.destroyed).toBe(true);
  });

  it("gives each owner an independent client and closes resources without deleting objects", async () => {
    const destroy = vi.spyOn(S3Client.prototype, "destroy");
    const other = createObjectStorage({ ...configuration, bucket: "other-bucket" });
    try {
      await storage.write({
        key: "retained",
        body: Readable.from([Buffer.from("abc")]),
        expectedSizeBytes: 3,
      });
      const ownerClient = send.mock.contexts[0];
      await other.delete("unrelated");
      expect(send.mock.contexts[1]).not.toBe(ownerClient);
      expect(send.mock.calls[1]![0].input).toEqual({ Bucket: "other-bucket", Key: "unrelated" });
      expect(destroy).not.toHaveBeenCalled();
      storage.close();
      expect(destroy.mock.contexts).toEqual([ownerClient]);
      expect(send).toHaveBeenCalledTimes(2);
      expect(objects.get("retained")).toEqual(Buffer.from("abc"));
      await other.delete("still-operational");
    } finally {
      other.close();
    }
  });
});
