import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { JobType, jobEventSchema } from "./index.js";
import { createJobRelay } from "./relay.js";

import type { Job } from "./index.js";
import type { JobProducer } from "./producer.js";
import type { JobRelay, JobRelayOptions, JobRelayRepository } from "./relay.js";
import type { Logger } from "pino";
import type { Mock } from "vitest";

const initialTime = new Date("2026-08-27T10:00:00.000Z");

function createStoredJob(overrides: Partial<Job> = {}): Job {
  const event = jobEventSchema.parse({
    specversion: "1.0",
    id: "550e8400-e29b-41d4-a716-446655440001",
    source: "/services/relay-test",
    type: JobType.INGESTION,
    time: initialTime.toISOString(),
    datacontenttype: "application/json",
    data: {
      userid: "550e8400-e29b-41d4-a716-446655440000",
      ingestdataurl: "https://example.com/ingest.json",
      format: "json",
    },
  });

  return {
    id: event.id,
    event,
    publicationState: "pending",
    publicationAttempts: 0,
    nextPublicationAttemptAt: initialTime,
    lastPublicationError: null,
    publishedAt: null,
    abandonedAt: null,
    executionState: "pending",
    executionStartedAt: null,
    executionFinishedAt: null,
    executionError: null,
    createdAt: initialTime,
    updatedAt: initialTime,
    ...overrides,
  };
}

function createLogger(): { logger: Logger; childLogger: Record<string, Mock> } {
  const childLogger = {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  };
  const logger = { child: vi.fn(() => childLogger) } as unknown as Logger;
  return { logger, childLogger };
}

function createDependencies(overrides: Partial<JobRelayOptions> = {}) {
  const repository = {
    getNextEligiblePublication: vi
      .fn<JobRelayRepository["getNextEligiblePublication"]>()
      .mockResolvedValue(null),
    recordPublicationSuccess: vi
      .fn<JobRelayRepository["recordPublicationSuccess"]>()
      .mockResolvedValue(null),
    recordPublicationFailure: vi
      .fn<JobRelayRepository["recordPublicationFailure"]>()
      .mockResolvedValue(null),
  } satisfies JobRelayRepository;
  const producer = {
    publish: vi.fn<JobProducer["publish"]>().mockResolvedValue(undefined),
    close: vi.fn<JobProducer["close"]>().mockResolvedValue(undefined),
  } satisfies JobProducer;
  const { logger, childLogger } = createLogger();
  const options: JobRelayOptions = { repository, producer, logger, ...overrides };

  return { options, producer, repository, childLogger };
}

async function flush(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

interface Deferred<T> {
  promise: Promise<T>;
  reject(reason?: unknown): void;
  resolve(value: T | PromiseLike<T>): void;
}

function createDeferred<T>(): Deferred<T> {
  const promiseConstructor = Promise as PromiseConstructor & {
    withResolvers<TResult>(): Deferred<TResult>;
  };
  return promiseConstructor.withResolvers<T>();
}

describe("createJobRelay", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: initialTime });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    ["maximumAttempts", 0],
    ["maximumAttempts", 1.5],
    ["maximumAttempts", 2_147_483_648],
    ["retryDelayMs", 0],
    ["retryDelayMs", Number.NaN],
    ["idlePollIntervalMs", -1],
    ["idlePollIntervalMs", 2_147_483_648],
  ] as const)("rejects invalid %s values", (name, value) => {
    const { options } = createDependencies();

    expect(() => createJobRelay({ ...options, [name]: value })).toThrow(RangeError);
  });

  it("polls immediately and waits for the idle interval only when empty", async () => {
    const { options, repository } = createDependencies();
    const relay = createJobRelay(options);

    await relay.start();
    await flush();
    expect(repository.getNextEligiblePublication).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(999);
    expect(repository.getNextEligiblePublication).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(repository.getNextEligiblePublication).toHaveBeenCalledTimes(2);

    await relay.stop();
  });

  it("publishes and records jobs strictly one at a time while draining", async () => {
    const firstJob = createStoredJob();
    const secondJob = createStoredJob({
      id: "550e8400-e29b-41d4-a716-446655440002",
      event: { ...firstJob.event, id: "550e8400-e29b-41d4-a716-446655440002" },
    });
    const firstPublish = createDeferred<void>();
    const secondPublish = createDeferred<void>();
    const { options, producer, repository } = createDependencies();
    repository.getNextEligiblePublication
      .mockResolvedValueOnce(firstJob)
      .mockResolvedValueOnce(secondJob)
      .mockResolvedValue(null);
    producer.publish
      .mockReturnValueOnce(firstPublish.promise)
      .mockReturnValueOnce(secondPublish.promise);
    const relay = createJobRelay(options);

    await relay.start();
    await flush();
    expect(producer.publish).toHaveBeenCalledTimes(1);
    expect(repository.getNextEligiblePublication).toHaveBeenCalledTimes(1);

    firstPublish.resolve();
    await flush();
    expect(repository.recordPublicationSuccess).toHaveBeenCalledTimes(1);
    expect(producer.publish).toHaveBeenCalledTimes(2);

    secondPublish.resolve();
    await flush();
    expect(repository.recordPublicationSuccess).toHaveBeenCalledTimes(2);
    expect(repository.getNextEligiblePublication).toHaveBeenCalledTimes(3);

    await relay.stop();
  });

  it("records a confirmed publication with its expected attempt", async () => {
    const job = createStoredJob({ publicationAttempts: 2 });
    const published = { ...job, publicationState: "published" as const, publicationAttempts: 3 };
    const { options, producer, repository, childLogger } = createDependencies();
    repository.getNextEligiblePublication.mockResolvedValueOnce(job).mockResolvedValue(null);
    repository.recordPublicationSuccess.mockResolvedValue(published);
    const relay = createJobRelay(options);

    await relay.start();
    await flush();

    expect(producer.publish).toHaveBeenCalledWith(job.event);
    expect(repository.recordPublicationSuccess).toHaveBeenCalledWith(job.id, {
      expectedPublicationAttempts: 2,
      updatedAt: initialTime,
    });
    expect(childLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: job.id,
        publicationState: "published",
        type: job.event.type,
      }),
      "job publication confirmed",
    );

    await relay.stop();
  });

  it("logs worker reconciliation of a failed publish as debug information", async () => {
    const job = createStoredJob();
    const published = {
      ...job,
      publicationState: "published" as const,
      publicationAttempts: 1,
    };
    const { options, producer, repository, childLogger } = createDependencies();
    producer.publish.mockRejectedValue(new Error("connection lost after delivery"));
    repository.getNextEligiblePublication.mockResolvedValueOnce(job).mockResolvedValue(null);
    repository.recordPublicationFailure.mockResolvedValue(published);
    const relay = createJobRelay(options);

    await relay.start();
    await flush();

    expect(childLogger.debug).toHaveBeenCalledWith(
      {
        jobId: job.id,
        type: job.event.type,
        publicationState: "published",
        publicationAttempts: 1,
      },
      "job publication failure reconciled with published state",
    );
    expect(childLogger.warn).not.toHaveBeenCalled();

    await relay.stop();
  });

  it("timestamps a failed outcome after publication settles", async () => {
    const job = createStoredJob();
    const publication = createDeferred<void>();
    const { options, producer, repository } = createDependencies();
    producer.publish.mockReturnValue(publication.promise);
    repository.getNextEligiblePublication.mockResolvedValueOnce(job).mockResolvedValue(null);
    const relay = createJobRelay(options);

    await relay.start();
    await flush();
    await vi.advanceTimersByTimeAsync(2_000);
    publication.reject(new Error("slow nack"));
    await flush();

    expect(repository.recordPublicationFailure).toHaveBeenCalledWith(job.id, {
      error: "slow nack",
      expectedPublicationAttempts: 0,
      maximumAttempts: 5,
      updatedAt: new Date(initialTime.getTime() + 2_000),
      nextPublicationAttemptAt: new Date(initialTime.getTime() + 7_000),
    });

    await relay.stop();
  });

  it("uses fixed-delay finite retries and exhausts the job", async () => {
    let storedJob = createStoredJob();
    const { options, producer, repository } = createDependencies({
      maximumAttempts: 2,
      retryDelayMs: 5_000,
      idlePollIntervalMs: 1_000,
    });
    producer.publish.mockRejectedValue(new Error("broker unavailable"));
    repository.getNextEligiblePublication.mockImplementation(async (now) =>
      storedJob.publicationState === "pending" &&
      storedJob.nextPublicationAttemptAt !== null &&
      storedJob.nextPublicationAttemptAt <= now
        ? storedJob
        : null,
    );
    repository.recordPublicationFailure.mockImplementation(async (_id, recordOptions) => {
      const attempts = storedJob.publicationAttempts + 1;
      storedJob = {
        ...storedJob,
        publicationAttempts: attempts,
        publicationState: attempts >= recordOptions.maximumAttempts ? "failed" : "pending",
        nextPublicationAttemptAt:
          attempts >= recordOptions.maximumAttempts ? null : recordOptions.nextPublicationAttemptAt,
        lastPublicationError: recordOptions.error,
        updatedAt: recordOptions.updatedAt,
      };
      return storedJob;
    });
    const relay = createJobRelay(options);

    await relay.start();
    await flush();
    expect(producer.publish).toHaveBeenCalledTimes(1);
    expect(storedJob.nextPublicationAttemptAt).toEqual(new Date(initialTime.getTime() + 5_000));

    await vi.advanceTimersByTimeAsync(4_999);
    expect(producer.publish).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(producer.publish).toHaveBeenCalledTimes(2);
    expect(storedJob.publicationState).toBe("failed");
    expect(storedJob.publicationAttempts).toBe(2);
    expect(repository.recordPublicationFailure).toHaveBeenLastCalledWith(
      storedJob.id,
      expect.objectContaining({
        error: "broker unavailable",
        expectedPublicationAttempts: 1,
        maximumAttempts: 2,
      }),
    );

    await relay.stop();
  });

  it("retries polling infrastructure failures after the fixed delay", async () => {
    const { options, repository, childLogger } = createDependencies();
    repository.getNextEligiblePublication
      .mockRejectedValueOnce(new Error("database unavailable"))
      .mockResolvedValue(null);
    const relay = createJobRelay(options);

    await relay.start();
    await flush();
    expect(repository.getNextEligiblePublication).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(4_999);
    expect(repository.getNextEligiblePublication).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(repository.getNextEligiblePublication).toHaveBeenCalledTimes(2);
    expect(childLogger.error).toHaveBeenCalledWith(
      { err: expect.any(Error) },
      "job relay polling failed",
    );

    await relay.stop();
  });

  it("retries only the success write after confirmation", async () => {
    const job = createStoredJob();
    const { options, producer, repository } = createDependencies();
    repository.getNextEligiblePublication.mockResolvedValueOnce(job).mockResolvedValue(null);
    repository.recordPublicationSuccess
      .mockRejectedValueOnce(new Error("write failed"))
      .mockResolvedValue({ ...job, publicationState: "published", publicationAttempts: 1 });
    const relay = createJobRelay(options);

    await relay.start();
    await flush();
    expect(producer.publish).toHaveBeenCalledTimes(1);
    expect(repository.recordPublicationSuccess).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5_000);
    expect(repository.recordPublicationSuccess).toHaveBeenCalledTimes(2);
    expect(producer.publish).toHaveBeenCalledTimes(1);
    expect(repository.recordPublicationSuccess).toHaveBeenNthCalledWith(2, job.id, {
      expectedPublicationAttempts: 0,
      updatedAt: initialTime,
    });

    await relay.stop();
  });

  it("retries a failed-outcome write without counting a new outcome", async () => {
    const job = createStoredJob({ publicationAttempts: 3 });
    const { options, producer, repository } = createDependencies();
    repository.getNextEligiblePublication.mockResolvedValueOnce(job).mockResolvedValue(null);
    producer.publish.mockRejectedValue(new Error("nack"));
    repository.recordPublicationFailure
      .mockRejectedValueOnce(new Error("write failed"))
      .mockResolvedValue({ ...job, publicationAttempts: 4 });
    const relay = createJobRelay(options);

    await relay.start();
    await flush();
    const firstOptions = repository.recordPublicationFailure.mock.calls[0]?.[1];
    await vi.advanceTimersByTimeAsync(5_000);

    expect(producer.publish).toHaveBeenCalledTimes(1);
    expect(repository.recordPublicationFailure).toHaveBeenCalledTimes(2);
    expect(repository.recordPublicationFailure.mock.calls[1]?.[1]).toEqual(firstOptions);
    expect(firstOptions).toEqual(
      expect.objectContaining({ expectedPublicationAttempts: 3, maximumAttempts: 5 }),
    );

    await relay.stop();
  });

  it("interrupts idle and infrastructure retry waits on stop", async () => {
    const idleDependencies = createDependencies();
    const idleRelay = createJobRelay(idleDependencies.options);
    await idleRelay.start();
    await flush();
    await idleRelay.stop();

    const retryDependencies = createDependencies();
    retryDependencies.repository.getNextEligiblePublication.mockRejectedValue(
      new Error("database unavailable"),
    );
    const retryRelay = createJobRelay(retryDependencies.options);
    await retryRelay.start();
    await flush();
    await retryRelay.stop();

    expect(idleDependencies.repository.getNextEligiblePublication).toHaveBeenCalledTimes(1);
    expect(retryDependencies.repository.getNextEligiblePublication).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("waits for an executing publish but starts no outcome write after stop", async () => {
    const job = createStoredJob();
    const publication = createDeferred<void>();
    const { options, producer, repository } = createDependencies();
    repository.getNextEligiblePublication.mockResolvedValue(job);
    producer.publish.mockReturnValue(publication.promise);
    const relay = createJobRelay(options);
    await relay.start();
    await flush();

    let stopped = false;
    const stopping = relay.stop().then(() => {
      stopped = true;
    });
    await flush();
    expect(stopped).toBe(false);

    publication.resolve();
    await stopping;
    expect(repository.recordPublicationSuccess).not.toHaveBeenCalled();
    expect(repository.getNextEligiblePublication).toHaveBeenCalledTimes(1);
  });

  it("lets an executing database operation settle without another operation", async () => {
    const query = createDeferred<Job | null>();
    const { options, producer, repository } = createDependencies();
    repository.getNextEligiblePublication.mockReturnValue(query.promise);
    const relay = createJobRelay(options);
    await relay.start();
    await flush();

    const stopping = relay.stop();
    query.resolve(createStoredJob());
    await stopping;

    expect(producer.publish).not.toHaveBeenCalled();
    expect(repository.getNextEligiblePublication).toHaveBeenCalledTimes(1);
  });

  it("rejects duplicate starts and starts after an idempotent stop", async () => {
    const { options } = createDependencies();
    const relay: JobRelay = createJobRelay(options);

    await relay.start();
    await expect(relay.start()).rejects.toThrow("already started");
    await relay.stop();
    await relay.stop();
    await expect(relay.start()).rejects.toThrow("permanently stopped");

    const neverStarted = createJobRelay(createDependencies().options);
    await neverStarted.stop();
    await neverStarted.stop();
    await expect(neverStarted.start()).rejects.toThrow("permanently stopped");
  });
});
