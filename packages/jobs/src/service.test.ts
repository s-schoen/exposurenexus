import { beforeEach, describe, expect, it, vi } from "vitest";

import { JobType, jobEventSchema } from "./index.js";
import { createJobService, JobStateConflictError } from "./service.js";

import type { Job, JobExecutionState, JobPublicationState } from "./index.js";
import type { JobService, JobServiceRepository, JobStateConflictOperation } from "./service.js";
import type { Logger } from "pino";
import type { Mock } from "vitest";

const ingestionData = {
  userid: "550e8400-e29b-41d4-a716-446655440000",
  ingestdataurl: "https://example.com/ingest.json",
  format: "json",
};
const initialTime = new Date("2026-08-25T10:00:00.000Z");
const mutationTime = new Date("2026-08-25T11:00:00.000Z");

function createStoredJob(overrides: Partial<Job> = {}): Job {
  const event = jobEventSchema.parse({
    specversion: "1.0",
    id: "550e8400-e29b-41d4-a716-446655440001",
    source: "/services/test-worker",
    type: JobType.INGESTION,
    time: initialTime.toISOString(),
    datacontenttype: "application/json",
    data: ingestionData,
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

class MemoryJobServiceRepository implements JobServiceRepository {
  readonly jobs = new Map<string, Job>();

  async insert(job: Job): Promise<Job> {
    this.jobs.set(job.id, job);
    return job;
  }

  async getByID(id: string): Promise<Job | null> {
    return this.jobs.get(id) ?? null;
  }

  async listAll(): Promise<Job[]> {
    return [...this.jobs.values()];
  }

  async markRunning(id: string, updatedAt: Date): Promise<Job | null> {
    const job = this.jobs.get(id);
    if (job === undefined) {
      return null;
    }
    if (job.executionState === "succeeded" || job.executionState === "failed") {
      throw new JobStateConflictError(id, "markRunning");
    }

    const executionChanged = job.executionState === "pending";
    const publicationChanged = job.publicationState !== "published";
    if (!executionChanged && !publicationChanged) {
      return job;
    }

    const updatedJob: Job = {
      ...job,
      publicationState: "published",
      nextPublicationAttemptAt: null,
      lastPublicationError: null,
      publishedAt: job.publishedAt ?? updatedAt,
      executionState: "running",
      executionStartedAt: executionChanged ? updatedAt : job.executionStartedAt,
      updatedAt,
    };
    this.jobs.set(id, updatedJob);
    return updatedJob;
  }

  async markSucceeded(id: string, updatedAt: Date): Promise<Job | null> {
    const job = this.jobs.get(id);
    if (job === undefined) {
      return null;
    }
    if (job.executionState === "succeeded") {
      return job;
    }
    if (job.executionState !== "running") {
      throw new JobStateConflictError(id, "markSucceeded");
    }

    const updatedJob: Job = {
      ...job,
      executionState: "succeeded",
      executionFinishedAt: updatedAt,
      executionError: null,
      updatedAt,
    };
    this.jobs.set(id, updatedJob);
    return updatedJob;
  }

  async markFailed(id: string, error: string, updatedAt: Date): Promise<Job | null> {
    const job = this.jobs.get(id);
    if (job === undefined) {
      return null;
    }
    if (job.executionState === "failed") {
      return job;
    }
    if (job.executionState !== "running") {
      throw new JobStateConflictError(id, "markFailed");
    }

    const updatedJob: Job = {
      ...job,
      executionState: "failed",
      executionFinishedAt: updatedAt,
      executionError: error,
      updatedAt,
    };
    this.jobs.set(id, updatedJob);
    return updatedJob;
  }

  async retryPublication(id: string, updatedAt: Date): Promise<Job | null> {
    const job = this.jobs.get(id);
    if (job === undefined) {
      return null;
    }
    if (job.publicationState !== "failed") {
      throw new JobStateConflictError(id, "retryPublication");
    }

    const updatedJob: Job = {
      ...job,
      publicationState: "pending",
      publicationAttempts: 0,
      nextPublicationAttemptAt: updatedAt,
      lastPublicationError: null,
      updatedAt,
    };
    this.jobs.set(id, updatedJob);
    return updatedJob;
  }

  async abandonPublication(id: string, updatedAt: Date): Promise<Job | null> {
    const job = this.jobs.get(id);
    if (job === undefined) {
      return null;
    }
    if (job.publicationState !== "failed") {
      throw new JobStateConflictError(id, "abandonPublication");
    }

    const updatedJob: Job = {
      ...job,
      publicationState: "abandoned",
      abandonedAt: updatedAt,
      updatedAt,
    };
    this.jobs.set(id, updatedJob);
    return updatedJob;
  }

  async deleteByID(id: string): Promise<Job | null> {
    const job = this.jobs.get(id);
    if (job === undefined) {
      return null;
    }
    const executionTerminal = job.executionState === "succeeded" || job.executionState === "failed";
    if (
      job.publicationState !== "abandoned" &&
      !(job.publicationState === "published" && executionTerminal)
    ) {
      throw new JobStateConflictError(id, "deleteByID");
    }

    this.jobs.delete(id);
    return job;
  }
}

function expectConflict(error: unknown, operation: JobStateConflictOperation, id: string): void {
  expect(error).toBeInstanceOf(JobStateConflictError);
  expect(error).toMatchObject({ name: "JobStateConflictError", operation, jobID: id });
}

describe("createJobService", () => {
  let repository: MemoryJobServiceRepository;
  let debug: Mock;
  let logger: Pick<Logger, "debug">;
  let service: JobService;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(mutationTime);
    repository = new MemoryJobServiceRepository();
    debug = vi.fn();
    logger = { debug: debug as Logger["debug"] };
    service = createJobService({ source: "/services/job-service", repository, logger });
  });

  it("rejects an invalid configured CloudEvent source at construction", () => {
    expect(() =>
      createJobService({ source: "services/not-absolute", repository, logger }),
    ).toThrow();
  });

  it("creates and persists one validated initial job using the event time", async () => {
    const job = await service.create({
      type: JobType.INGESTION,
      data: ingestionData,
      subject: "ingestion/1",
    });

    expect(job.id).toBe(job.event.id);
    expect(job.event).toMatchObject({
      source: "/services/job-service",
      type: JobType.INGESTION,
      subject: "ingestion/1",
      data: ingestionData,
    });
    expect(jobEventSchema.parse(job.event)).toEqual(job.event);
    expect(job).toMatchObject({
      publicationState: "pending",
      publicationAttempts: 0,
      nextPublicationAttemptAt: mutationTime,
      lastPublicationError: null,
      publishedAt: null,
      abandonedAt: null,
      executionState: "pending",
      executionStartedAt: null,
      executionFinishedAt: null,
      executionError: null,
      createdAt: mutationTime,
      updatedAt: mutationTime,
    });
    expect(repository.jobs.get(job.id)).toBe(job);
    expect(debug).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.anything() }),
      expect.anything(),
    );
    expect(JSON.stringify(debug.mock.calls)).not.toContain(ingestionData.ingestdataurl);
  });

  it("rejects invalid job data before persistence", async () => {
    await expect(
      service.create({
        type: JobType.INGESTION,
        data: { ...ingestionData, userid: "not-a-uuid" },
      }),
    ).rejects.toThrow();
    expect(repository.jobs.size).toBe(0);
  });

  it("gets an existing job and returns null for a missing ID", async () => {
    const job = createStoredJob();
    repository.jobs.set(job.id, job);

    await expect(service.getByID(job.id)).resolves.toBe(job);
    await expect(service.getByID("missing")).resolves.toBeNull();
  });

  it("lists every stored job as a plain array", async () => {
    const first = createStoredJob();
    const second = createStoredJob({ id: "550e8400-e29b-41d4-a716-446655440002" });
    repository.jobs.set(first.id, first);
    repository.jobs.set(second.id, second);

    await expect(service.listAll()).resolves.toEqual([first, second]);
  });

  describe("markRunning", () => {
    it.each<JobPublicationState>(["pending", "failed", "abandoned"])(
      "starts execution and reconciles %s publication",
      async (publicationState) => {
        const abandonedAt = publicationState === "abandoned" ? initialTime : null;
        const job = createStoredJob({
          publicationState,
          publicationAttempts: 3,
          nextPublicationAttemptAt: initialTime,
          lastPublicationError: "broker unavailable",
          abandonedAt,
        });
        repository.jobs.set(job.id, job);

        await expect(service.markRunning(job.id)).resolves.toMatchObject({
          publicationState: "published",
          publicationAttempts: 3,
          nextPublicationAttemptAt: null,
          lastPublicationError: null,
          publishedAt: mutationTime,
          abandonedAt,
          executionState: "running",
          executionStartedAt: mutationTime,
          updatedAt: mutationTime,
        });
      },
    );

    it("is idempotent for a fully reconciled running job", async () => {
      const job = createStoredJob({
        publicationState: "published",
        publishedAt: initialTime,
        executionState: "running",
        executionStartedAt: initialTime,
      });
      repository.jobs.set(job.id, job);

      await expect(service.markRunning(job.id)).resolves.toBe(job);
      expect(repository.jobs.get(job.id)?.updatedAt).toBe(initialTime);
    });

    it("reconciles publication for an already-running job without replacing execution history", async () => {
      const job = createStoredJob({
        publicationState: "failed",
        executionState: "running",
        executionStartedAt: initialTime,
      });
      repository.jobs.set(job.id, job);

      await expect(service.markRunning(job.id)).resolves.toMatchObject({
        publicationState: "published",
        executionState: "running",
        executionStartedAt: initialTime,
        updatedAt: mutationTime,
      });
    });

    it("returns null when the job is missing", async () => {
      await expect(service.markRunning("missing")).resolves.toBeNull();
    });

    it.each<JobExecutionState>(["succeeded", "failed"])(
      "conflicts for %s execution",
      async (executionState) => {
        const job = createStoredJob({ executionState });
        repository.jobs.set(job.id, job);

        try {
          await service.markRunning(job.id);
          expect.unreachable("expected a state conflict");
        } catch (error) {
          expectConflict(error, "markRunning", job.id);
        }
      },
    );
  });

  describe("execution completion", () => {
    it("marks a running job succeeded and clears its execution error", async () => {
      const job = createStoredJob({
        publicationState: "published",
        executionState: "running",
        executionStartedAt: initialTime,
        executionError: "stale error",
      });
      repository.jobs.set(job.id, job);

      await expect(service.markSucceeded(job.id)).resolves.toMatchObject({
        executionState: "succeeded",
        executionFinishedAt: mutationTime,
        executionError: null,
        updatedAt: mutationTime,
      });
    });

    it("keeps a repeated success unchanged", async () => {
      const job = createStoredJob({
        executionState: "succeeded",
        executionFinishedAt: initialTime,
      });
      repository.jobs.set(job.id, job);

      await expect(service.markSucceeded(job.id)).resolves.toBe(job);
    });

    it("returns null when marking a missing job succeeded", async () => {
      await expect(service.markSucceeded("missing")).resolves.toBeNull();
    });

    it.each<JobExecutionState>(["pending", "failed"])(
      "conflicts when marking %s execution succeeded",
      async (executionState) => {
        const job = createStoredJob({ executionState });
        repository.jobs.set(job.id, job);

        await expect(service.markSucceeded(job.id)).rejects.toMatchObject({
          operation: "markSucceeded",
          jobID: job.id,
        });
      },
    );

    it("marks a running job failed without changing publication failure state", async () => {
      const job = createStoredJob({
        publicationState: "failed",
        publicationAttempts: 5,
        lastPublicationError: "publish failed",
        executionState: "running",
        executionStartedAt: initialTime,
      });
      repository.jobs.set(job.id, job);

      await expect(service.markFailed(job.id, { error: "handler failed" })).resolves.toMatchObject({
        publicationState: "failed",
        publicationAttempts: 5,
        lastPublicationError: "publish failed",
        executionState: "failed",
        executionFinishedAt: mutationTime,
        executionError: "handler failed",
      });
    });

    it("accepts an unrestricted execution error and preserves it on repeats", async () => {
      const job = createStoredJob({ executionState: "running", executionStartedAt: initialTime });
      repository.jobs.set(job.id, job);
      const error = "x".repeat(20_000);

      const failed = await service.markFailed(job.id, { error });
      vi.setSystemTime(new Date("2026-08-25T12:00:00.000Z"));
      await expect(service.markFailed(job.id, { error: "replacement" })).resolves.toBe(failed);
      expect(failed?.executionError).toBe(error);
      expect(failed?.executionFinishedAt).toEqual(mutationTime);
    });

    it("returns null when marking a missing job failed", async () => {
      await expect(service.markFailed("missing", { error: "failure" })).resolves.toBeNull();
    });

    it.each<JobExecutionState>(["pending", "succeeded"])(
      "conflicts when marking %s execution failed",
      async (executionState) => {
        const job = createStoredJob({ executionState });
        repository.jobs.set(job.id, job);

        await expect(service.markFailed(job.id, { error: "failure" })).rejects.toMatchObject({
          operation: "markFailed",
          jobID: job.id,
        });
      },
    );
  });

  describe("publication controls", () => {
    it("retries failed publication immediately with reset accounting", async () => {
      const job = createStoredJob({
        publicationState: "failed",
        publicationAttempts: 5,
        nextPublicationAttemptAt: initialTime,
        lastPublicationError: "broker unavailable",
      });
      repository.jobs.set(job.id, job);

      await expect(service.retryPublication(job.id)).resolves.toMatchObject({
        publicationState: "pending",
        publicationAttempts: 0,
        nextPublicationAttemptAt: mutationTime,
        lastPublicationError: null,
        updatedAt: mutationTime,
      });
    });

    it("returns null when retrying a missing job", async () => {
      await expect(service.retryPublication("missing")).resolves.toBeNull();
    });

    it.each<JobPublicationState>(["pending", "published", "abandoned"])(
      "conflicts when retrying %s publication",
      async (publicationState) => {
        const job = createStoredJob({ publicationState });
        repository.jobs.set(job.id, job);

        await expect(service.retryPublication(job.id)).rejects.toMatchObject({
          operation: "retryPublication",
          jobID: job.id,
        });
      },
    );

    it("abandons failed publication and records the time", async () => {
      const job = createStoredJob({ publicationState: "failed" });
      repository.jobs.set(job.id, job);

      await expect(service.abandonPublication(job.id)).resolves.toMatchObject({
        publicationState: "abandoned",
        abandonedAt: mutationTime,
        updatedAt: mutationTime,
      });
    });

    it("returns null when abandoning a missing job", async () => {
      await expect(service.abandonPublication("missing")).resolves.toBeNull();
    });

    it.each<JobPublicationState>(["pending", "published", "abandoned"])(
      "conflicts when abandoning %s publication",
      async (publicationState) => {
        const job = createStoredJob({ publicationState });
        repository.jobs.set(job.id, job);

        await expect(service.abandonPublication(job.id)).rejects.toMatchObject({
          operation: "abandonPublication",
          jobID: job.id,
        });
      },
    );
  });

  describe("deleteByID", () => {
    it.each([
      ["abandoned", "pending"],
      ["published", "succeeded"],
      ["published", "failed"],
    ] as const)(
      "deletes %s publication with %s execution",
      async (publicationState, executionState) => {
        const job = createStoredJob({ publicationState, executionState });
        repository.jobs.set(job.id, job);

        await expect(service.deleteByID(job.id)).resolves.toBe(job);
        expect(repository.jobs.has(job.id)).toBe(false);
      },
    );

    it("returns null when deleting a missing job", async () => {
      await expect(service.deleteByID("missing")).resolves.toBeNull();
    });

    it.each([
      ["pending", "pending"],
      ["failed", "failed"],
      ["published", "pending"],
      ["published", "running"],
    ] as const)(
      "conflicts for %s publication with %s execution",
      async (publicationState, executionState) => {
        const job = createStoredJob({ publicationState, executionState });
        repository.jobs.set(job.id, job);

        await expect(service.deleteByID(job.id)).rejects.toMatchObject({
          operation: "deleteByID",
          jobID: job.id,
        });
      },
    );
  });
});
