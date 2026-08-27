import { sql } from "kysely";

import { JobStateConflictError } from "./service.js";

import type { Job, JobEvent } from "./contracts/jobs.js";
import type { JobServiceRepository, JobStateConflictOperation } from "./service.js";
import type { Kysely, Transaction } from "kysely";

export interface JobTable {
  id: string;
  event: JobEvent;
  publicationState: Job["publicationState"];
  publicationAttempts: number;
  nextPublicationAttemptAt: Date | null;
  lastPublicationError: string | null;
  publishedAt: Date | null;
  abandonedAt: Date | null;
  executionState: Job["executionState"];
  executionStartedAt: Date | null;
  executionFinishedAt: Date | null;
  executionError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface JobDatabase {
  job: JobTable;
}

export interface PublicationSuccessOptions {
  expectedPublicationAttempts: number;
  updatedAt: Date;
}

export interface PublicationFailureOptions extends PublicationSuccessOptions {
  error: string;
  maximumAttempts: number;
  nextPublicationAttemptAt: Date;
}

export interface JobRepository extends JobServiceRepository {
  getNextEligiblePublication(now: Date): Promise<Job | null>;
  recordPublicationSuccess(id: string, options: PublicationSuccessOptions): Promise<Job | null>;
  recordPublicationFailure(id: string, options: PublicationFailureOptions): Promise<Job | null>;
}

type JobExecutor<Database extends JobDatabase> = Kysely<Database> | Transaction<Database>;

function firstJob(rows: readonly JobTable[]): Job | null {
  return rows[0] ?? null;
}

export function createJobRepository<Database extends JobDatabase>(
  executor: JobExecutor<Database>,
): JobRepository {
  const getByID = async (id: string): Promise<Job | null> => {
    const result = await sql<JobTable>`select * from "job" where "id" = ${id}`.execute(executor);
    return firstJob(result.rows);
  };

  const resolveConditionalMutation = async (
    id: string,
    operation: JobStateConflictOperation,
    isIdempotent: (job: Job) => boolean,
  ): Promise<Job | null> => {
    const job = await getByID(id);
    if (job === null || isIdempotent(job)) {
      return job;
    }
    throw new JobStateConflictError(id, operation);
  };

  return {
    async insert(job) {
      const result = await sql<JobTable>`
        insert into "job" (
          "id", "event", "publicationState", "publicationAttempts",
          "nextPublicationAttemptAt", "lastPublicationError", "publishedAt", "abandonedAt",
          "executionState", "executionStartedAt", "executionFinishedAt", "executionError",
          "createdAt", "updatedAt"
        ) values (
          ${job.id}, ${JSON.stringify(job.event)}::jsonb, ${job.publicationState},
          ${job.publicationAttempts}, ${job.nextPublicationAttemptAt}, ${job.lastPublicationError},
          ${job.publishedAt}, ${job.abandonedAt}, ${job.executionState}, ${job.executionStartedAt},
          ${job.executionFinishedAt}, ${job.executionError}, ${job.createdAt}, ${job.updatedAt}
        )
        returning *
      `.execute(executor);
      return firstJob(result.rows) as Job;
    },

    getByID,

    async listAll() {
      const result = await sql<JobTable>`select * from "job"`.execute(executor);
      return [...result.rows];
    },

    async markRunning(id, updatedAt) {
      const result = await sql<JobTable>`
        update "job"
        set
          "publicationState" = 'published',
          "nextPublicationAttemptAt" = null,
          "lastPublicationError" = null,
          "publishedAt" = coalesce("publishedAt", ${updatedAt}),
          "executionState" = 'running',
          "executionStartedAt" = case
            when "executionState" = 'pending' then ${updatedAt}
            else "executionStartedAt"
          end,
          "updatedAt" = ${updatedAt}
        where "id" = ${id}
          and "executionState" in ('pending', 'running')
          and ("executionState" = 'pending' or "publicationState" <> 'published')
        returning *
      `.execute(executor);
      return (
        firstJob(result.rows) ??
        resolveConditionalMutation(
          id,
          "markRunning",
          (job) => job.executionState === "running" && job.publicationState === "published",
        )
      );
    },

    async markSucceeded(id, updatedAt) {
      const result = await sql<JobTable>`
        update "job"
        set
          "executionState" = 'succeeded',
          "executionFinishedAt" = ${updatedAt},
          "executionError" = null,
          "updatedAt" = ${updatedAt}
        where "id" = ${id} and "executionState" = 'running'
        returning *
      `.execute(executor);
      return (
        firstJob(result.rows) ??
        resolveConditionalMutation(id, "markSucceeded", (job) => job.executionState === "succeeded")
      );
    },

    async markFailed(id, error, updatedAt) {
      const result = await sql<JobTable>`
        update "job"
        set
          "executionState" = 'failed',
          "executionFinishedAt" = ${updatedAt},
          "executionError" = ${error},
          "updatedAt" = ${updatedAt}
        where "id" = ${id} and "executionState" = 'running'
        returning *
      `.execute(executor);
      return (
        firstJob(result.rows) ??
        resolveConditionalMutation(id, "markFailed", (job) => job.executionState === "failed")
      );
    },

    async retryPublication(id, updatedAt) {
      const result = await sql<JobTable>`
        update "job"
        set
          "publicationState" = 'pending',
          "publicationAttempts" = 0,
          "nextPublicationAttemptAt" = ${updatedAt},
          "lastPublicationError" = null,
          "updatedAt" = ${updatedAt}
        where "id" = ${id} and "publicationState" = 'failed'
        returning *
      `.execute(executor);
      return (
        firstJob(result.rows) ?? resolveConditionalMutation(id, "retryPublication", () => false)
      );
    },

    async abandonPublication(id, updatedAt) {
      const result = await sql<JobTable>`
        update "job"
        set
          "publicationState" = 'abandoned',
          "abandonedAt" = ${updatedAt},
          "updatedAt" = ${updatedAt}
        where "id" = ${id} and "publicationState" = 'failed'
        returning *
      `.execute(executor);
      return (
        firstJob(result.rows) ?? resolveConditionalMutation(id, "abandonPublication", () => false)
      );
    },

    async deleteByID(id) {
      const result = await sql<JobTable>`
        delete from "job"
        where "id" = ${id}
          and (
            "publicationState" = 'abandoned'
            or (
              "publicationState" = 'published'
              and "executionState" in ('succeeded', 'failed')
            )
          )
        returning *
      `.execute(executor);
      return firstJob(result.rows) ?? resolveConditionalMutation(id, "deleteByID", () => false);
    },

    async getNextEligiblePublication(now) {
      const result = await sql<JobTable>`
        select *
        from "job"
        where "publicationState" = 'pending'
          and "nextPublicationAttemptAt" <= ${now}
        order by "createdAt" asc, "id" asc
        limit 1
      `.execute(executor);
      return firstJob(result.rows);
    },

    async recordPublicationSuccess(id, options) {
      const result = await sql<JobTable>`
        update "job"
        set
          "publicationState" = 'published',
          "publicationAttempts" = "publicationAttempts" + 1,
          "nextPublicationAttemptAt" = null,
          "lastPublicationError" = null,
          "publishedAt" = coalesce("publishedAt", ${options.updatedAt}),
          "updatedAt" = ${options.updatedAt}
        where "id" = ${id}
          and "publicationAttempts" = ${options.expectedPublicationAttempts}
        returning *
      `.execute(executor);
      return firstJob(result.rows) ?? getByID(id);
    },

    async recordPublicationFailure(id, options) {
      const result = await sql<JobTable>`
        update "job"
        set
          "publicationState" = case
            when "publicationState" = 'published' then 'published'
            when "publicationAttempts" + 1 >= ${options.maximumAttempts} then 'failed'
            else 'pending'
          end,
          "publicationAttempts" = "publicationAttempts" + 1,
          "nextPublicationAttemptAt" = case
            when "publicationState" = 'published' then null
            when "publicationAttempts" + 1 >= ${options.maximumAttempts} then null
            else ${options.nextPublicationAttemptAt}::timestamptz
          end,
          "lastPublicationError" = case
            when "publicationState" = 'published' then null
            else ${options.error}
          end,
          "updatedAt" = ${options.updatedAt}
        where "id" = ${id}
          and "publicationAttempts" = ${options.expectedPublicationAttempts}
          and "publicationState" in ('pending', 'published')
        returning *
      `.execute(executor);
      return firstJob(result.rows) ?? getByID(id);
    },
  };
}
