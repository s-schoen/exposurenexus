import { PGlite } from "@electric-sql/pglite";
import { JobType } from "@exposurenexus/jobs";
import { createJobRepository } from "@exposurenexus/jobs/postgres";
import { JobStateConflictError } from "@exposurenexus/jobs/service";
import { PGliteDialect, sql } from "kysely";
import { Migrator } from "kysely/migration";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "./factory.js";
import { createMigrationProvider } from "./migration.js";

import type { Database } from "./index.js";
import type { Job, JobEvent, JobExecutionState, JobPublicationState } from "@exposurenexus/jobs";
import type { JobRepository } from "@exposurenexus/jobs/postgres";
import type { JobStateConflictOperation } from "@exposurenexus/jobs/service";
import type { Kysely } from "kysely";

const initialTime = new Date("2026-08-27T10:00:00.000Z");
let nextID = 1;

function jobID(sequence = nextID++): string {
  return `00000000-0000-4000-8000-${sequence.toString(16).padStart(12, "0")}`;
}

function makeJob(overrides: Partial<Omit<Job, "id" | "event">> & { id?: string } = {}): Job {
  const id = overrides.id ?? jobID();
  return {
    id,
    event: {
      specversion: "1.0",
      id,
      source: "/services/api",
      type: JobType.INGESTION,
      time: initialTime.toISOString(),
      datacontenttype: "application/json",
      data: {
        userid: "00000000-0000-4000-8000-000000000099",
        ingestdataurl: "https://example.test/findings.json",
        format: "json",
      },
    },
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

async function migrate(database: Kysely<Database>): Promise<Migrator> {
  const migrator = new Migrator({ db: database, provider: createMigrationProvider() });
  const result = await migrator.migrateToLatest();
  expect(result.error).toBeUndefined();
  return migrator;
}

async function expectConflict(
  promise: Promise<Job | null>,
  operation: JobStateConflictOperation,
  id: string,
): Promise<void> {
  await expect(promise).rejects.toMatchObject({
    name: "JobStateConflictError",
    operation,
    jobID: id,
  });
  await expect(promise.catch((error: unknown) => error)).resolves.toBeInstanceOf(
    JobStateConflictError,
  );
}

describe("20260827 job outbox migration", () => {
  it(
    "enforces the durable job constraints and rolls back the table and index",
    { timeout: 30_000 },
    async () => {
      const pgLite = new PGlite("memory://");
      await pgLite.waitReady;
      const database = createDatabase(new PGliteDialect({ pglite: pgLite }));

      try {
        const migrator = await migrate(database);
        const repository = createJobRepository(database);
        const validJob = makeJob();
        await expect(repository.insert(validJob)).resolves.toEqual(validJob);

        await expect(
          repository.insert({ ...makeJob(), publicationAttempts: -1 }),
        ).rejects.toThrow();
        await expect(
          repository.insert({
            ...makeJob(),
            publicationState: "unknown" as JobPublicationState,
          }),
        ).rejects.toThrow();
        await expect(
          repository.insert({ ...makeJob(), executionState: "unknown" as JobExecutionState }),
        ).rejects.toThrow();
        const mismatchedEvent = makeJob();
        await expect(repository.insert({ ...mismatchedEvent, id: jobID() })).rejects.toThrow();
        await expect(
          repository.insert({
            ...makeJob(),
            event: "not an object" as unknown as JobEvent,
          }),
        ).rejects.toThrow();

        const rollback = await migrator.migrateDown();
        expect(rollback.error).toBeUndefined();
        await expect(sql`select 1 from "job"`.execute(database)).rejects.toThrow();
        await expect(
          sql`select 1 from pg_indexes where indexname = 'job_publication_eligibility'`.execute(
            database,
          ),
        ).resolves.toMatchObject({ rows: [] });
      } finally {
        await database.destroy();
        if (!pgLite.closed) await pgLite.close();
      }
    },
  );
});

describe("PostgreSQL job repository", () => {
  let pgLite: PGlite;
  let database: Kysely<Database>;
  let repository: JobRepository;

  beforeAll(async () => {
    pgLite = new PGlite("memory://");
    await pgLite.waitReady;
    database = createDatabase(new PGliteDialect({ pglite: pgLite }));
    await migrate(database);
    repository = createJobRepository(database);
  }, 30_000);

  beforeEach(async () => {
    await sql`truncate table "job"`.execute(database);
  });

  afterAll(async () => {
    await database.destroy();
    if (!pgLite.closed) await pgLite.close();
  });

  it("participates in caller-owned commit and rollback transactions", async () => {
    const committed = makeJob();
    await database.transaction().execute(async (transaction) => {
      const transactionRepository = createJobRepository(transaction);
      await transactionRepository.insert(committed);
      await expect(transactionRepository.getByID(committed.id)).resolves.toEqual(committed);
    });
    await expect(repository.getByID(committed.id)).resolves.toEqual(committed);

    const rolledBack = makeJob();
    await expect(
      database.transaction().execute(async (transaction) => {
        await createJobRepository(transaction).insert(rolledBack);
        throw new Error("roll back");
      }),
    ).rejects.toThrow("roll back");
    await expect(repository.getByID(rolledBack.id)).resolves.toBeNull();
    await expect(repository.getByID("00000000-0000-4000-8000-000000000000")).resolves.toBeNull();
    await expect(repository.listAll()).resolves.toEqual([committed]);
  });

  it("applies execution transitions, reconciliation, idempotence, and conflicts atomically", async () => {
    const mutationTime = new Date("2026-08-27T10:01:00.000Z");
    for (const publicationState of ["pending", "failed", "abandoned"] as const) {
      const original = makeJob({
        publicationState,
        publicationAttempts: 2,
        lastPublicationError: "broker unavailable",
        abandonedAt: publicationState === "abandoned" ? initialTime : null,
      });
      await repository.insert(original);

      const running = await repository.markRunning(original.id, mutationTime);
      expect(running).toMatchObject({
        publicationState: "published",
        publicationAttempts: 2,
        nextPublicationAttemptAt: null,
        lastPublicationError: null,
        publishedAt: mutationTime,
        abandonedAt: original.abandonedAt,
        executionState: "running",
        executionStartedAt: mutationTime,
        updatedAt: mutationTime,
      });
      await expect(repository.markRunning(original.id, new Date())).resolves.toEqual(running);
    }

    const succeededSource = makeJob();
    await repository.insert(succeededSource);
    await repository.markRunning(succeededSource.id, mutationTime);
    const succeeded = await repository.markSucceeded(
      succeededSource.id,
      new Date("2026-08-27T10:02:00Z"),
    );
    expect(succeeded).toMatchObject({ executionState: "succeeded", executionError: null });
    await expect(repository.markSucceeded(succeededSource.id, new Date())).resolves.toEqual(
      succeeded,
    );
    await expectConflict(
      repository.markFailed(succeededSource.id, "late failure", new Date()),
      "markFailed",
      succeededSource.id,
    );
    await expectConflict(
      repository.markRunning(succeededSource.id, new Date()),
      "markRunning",
      succeededSource.id,
    );

    const failedSource = makeJob();
    await repository.insert(failedSource);
    await repository.markRunning(failedSource.id, mutationTime);
    const failed = await repository.markFailed(
      failedSource.id,
      "first failure",
      new Date("2026-08-27T10:03:00Z"),
    );
    expect(failed).toMatchObject({ executionState: "failed", executionError: "first failure" });
    await expect(
      repository.markFailed(failedSource.id, "replacement", new Date()),
    ).resolves.toEqual(failed);
    await expectConflict(
      repository.markSucceeded(failedSource.id, new Date()),
      "markSucceeded",
      failedSource.id,
    );

    const pending = makeJob();
    await repository.insert(pending);
    await expectConflict(
      repository.markSucceeded(pending.id, new Date()),
      "markSucceeded",
      pending.id,
    );
    await expectConflict(
      repository.markFailed(pending.id, "failure", new Date()),
      "markFailed",
      pending.id,
    );

    const missing = "00000000-0000-4000-8000-000000000000";
    await expect(repository.markRunning(missing, new Date())).resolves.toBeNull();
    await expect(repository.markSucceeded(missing, new Date())).resolves.toBeNull();
    await expect(repository.markFailed(missing, "failure", new Date())).resolves.toBeNull();
  });

  it("applies manual publication and deletion transition predicates", async () => {
    const mutationTime = new Date("2026-08-27T10:05:00.000Z");
    const failed = makeJob({
      publicationState: "failed",
      publicationAttempts: 5,
      nextPublicationAttemptAt: null,
      lastPublicationError: "exhausted",
    });
    await repository.insert(failed);
    await expect(repository.retryPublication(failed.id, mutationTime)).resolves.toMatchObject({
      publicationState: "pending",
      publicationAttempts: 0,
      nextPublicationAttemptAt: mutationTime,
      lastPublicationError: null,
      updatedAt: mutationTime,
    });
    await expectConflict(
      repository.retryPublication(failed.id, new Date()),
      "retryPublication",
      failed.id,
    );

    const abandonedSource = makeJob({ publicationState: "failed" });
    await repository.insert(abandonedSource);
    const abandoned = await repository.abandonPublication(abandonedSource.id, mutationTime);
    expect(abandoned).toMatchObject({ publicationState: "abandoned", abandonedAt: mutationTime });
    await expectConflict(
      repository.abandonPublication(abandonedSource.id, new Date()),
      "abandonPublication",
      abandonedSource.id,
    );
    await expect(repository.deleteByID(abandonedSource.id)).resolves.toEqual(abandoned);
    await expect(repository.deleteByID(abandonedSource.id)).resolves.toBeNull();

    for (const executionState of ["succeeded", "failed"] as const) {
      const deletable = makeJob({ publicationState: "published", executionState });
      await repository.insert(deletable);
      await expect(repository.deleteByID(deletable.id)).resolves.toEqual(deletable);
    }

    for (const blocked of [
      makeJob({ publicationState: "pending" }),
      makeJob({ publicationState: "failed" }),
      makeJob({ publicationState: "published", executionState: "pending" }),
      makeJob({ publicationState: "published", executionState: "running" }),
    ]) {
      await repository.insert(blocked);
      await expectConflict(repository.deleteByID(blocked.id), "deleteByID", blocked.id);
    }

    const missing = "00000000-0000-4000-8000-000000000000";
    await expect(repository.retryPublication(missing, new Date())).resolves.toBeNull();
    await expect(repository.abandonPublication(missing, new Date())).resolves.toBeNull();
    await expect(repository.deleteByID(missing)).resolves.toBeNull();
  });

  it("selects only the oldest currently eligible pending publication", async () => {
    const now = new Date("2026-08-27T11:00:00.000Z");
    const later = makeJob({ createdAt: new Date("2026-08-27T10:30:00Z") });
    const oldest = makeJob({ createdAt: new Date("2026-08-27T10:15:00Z") });
    const future = makeJob({ nextPublicationAttemptAt: new Date("2026-08-27T12:00:00Z") });
    const published = makeJob({ publicationState: "published" });
    await Promise.all([later, oldest, future, published].map((job) => repository.insert(job)));

    await expect(repository.getNextEligiblePublication(now)).resolves.toEqual(oldest);
    await repository.recordPublicationSuccess(oldest.id, {
      expectedPublicationAttempts: 0,
      updatedAt: now,
    });
    await expect(repository.getNextEligiblePublication(now)).resolves.toEqual(later);
  });

  it("records retry-safe publication success and reconciles late positive evidence", async () => {
    const outcomeTime = new Date("2026-08-27T11:00:00.000Z");
    for (const publicationState of ["pending", "failed", "abandoned"] as const) {
      const original = makeJob({
        publicationState,
        publicationAttempts: 2,
        lastPublicationError: "old failure",
        abandonedAt: publicationState === "abandoned" ? initialTime : null,
      });
      await repository.insert(original);
      const options = { expectedPublicationAttempts: 2, updatedAt: outcomeTime };

      const published = await repository.recordPublicationSuccess(original.id, options);
      expect(published).toMatchObject({
        publicationState: "published",
        publicationAttempts: 3,
        nextPublicationAttemptAt: null,
        lastPublicationError: null,
        publishedAt: outcomeTime,
        abandonedAt: original.abandonedAt,
        updatedAt: outcomeTime,
      });
      await expect(repository.recordPublicationSuccess(original.id, options)).resolves.toEqual(
        published,
      );
    }
    await expect(
      repository.recordPublicationSuccess("00000000-0000-4000-8000-000000000000", {
        expectedPublicationAttempts: 0,
        updatedAt: outcomeTime,
      }),
    ).resolves.toBeNull();
  });

  it("records retry-safe publication failures without downgrading published evidence", async () => {
    const outcomeTime = new Date("2026-08-27T11:00:00.000Z");
    const retryAt = new Date("2026-08-27T11:00:05.000Z");
    const retrying = makeJob({ publicationAttempts: 1 });
    await repository.insert(retrying);
    const retryOptions = {
      expectedPublicationAttempts: 1,
      maximumAttempts: 3,
      nextPublicationAttemptAt: retryAt,
      error: "broker unavailable",
      updatedAt: outcomeTime,
    };
    const pending = await repository.recordPublicationFailure(retrying.id, retryOptions);
    expect(pending).toMatchObject({
      publicationState: "pending",
      publicationAttempts: 2,
      nextPublicationAttemptAt: retryAt,
      lastPublicationError: "broker unavailable",
    });
    await expect(repository.recordPublicationFailure(retrying.id, retryOptions)).resolves.toEqual(
      pending,
    );

    const exhausted = makeJob({ publicationAttempts: 2 });
    await repository.insert(exhausted);
    await expect(
      repository.recordPublicationFailure(exhausted.id, {
        ...retryOptions,
        expectedPublicationAttempts: 2,
      }),
    ).resolves.toMatchObject({
      publicationState: "failed",
      publicationAttempts: 3,
      nextPublicationAttemptAt: null,
      lastPublicationError: "broker unavailable",
    });

    const workerObserved = makeJob({
      publicationState: "published",
      publicationAttempts: 1,
      publishedAt: initialTime,
    });
    await repository.insert(workerObserved);
    await expect(
      repository.recordPublicationFailure(workerObserved.id, retryOptions),
    ).resolves.toMatchObject({
      publicationState: "published",
      publicationAttempts: 2,
      publishedAt: initialTime,
      nextPublicationAttemptAt: null,
      lastPublicationError: null,
    });
    await expect(
      repository.recordPublicationFailure("00000000-0000-4000-8000-000000000000", retryOptions),
    ).resolves.toBeNull();
  });
});
