import { eventAttributesSchema } from "./contracts/events.js";
import { createJobEvent } from "./contracts/jobs.js";

import type { Job, JobDataFor, JobEventType } from "./contracts/jobs.js";
import type { Logger } from "pino";

export type JobStateConflictOperation =
  | "markRunning"
  | "markSucceeded"
  | "markFailed"
  | "retryPublication"
  | "abandonPublication"
  | "deleteByID";

export class JobStateConflictError extends Error {
  readonly jobID: string;
  readonly operation: JobStateConflictOperation;

  constructor(jobID: string, operation: JobStateConflictOperation) {
    super(`Job ${jobID} cannot perform ${operation} from its current state`);
    this.name = "JobStateConflictError";
    this.jobID = jobID;
    this.operation = operation;
  }
}

export interface JobServiceRepository {
  insert(job: Job): Promise<Job>;
  getByID(id: string): Promise<Job | null>;
  listAll(): Promise<Job[]>;
  markRunning(id: string, updatedAt: Date): Promise<Job | null>;
  markSucceeded(id: string, updatedAt: Date): Promise<Job | null>;
  markFailed(id: string, error: string, updatedAt: Date): Promise<Job | null>;
  retryPublication(id: string, updatedAt: Date): Promise<Job | null>;
  abandonPublication(id: string, updatedAt: Date): Promise<Job | null>;
  deleteByID(id: string): Promise<Job | null>;
}

export interface JobServiceOptions {
  source: string;
  repository: JobServiceRepository;
  logger: Pick<Logger, "debug">;
}

export interface JobService {
  create<T extends JobEventType>(options: {
    type: T;
    data: JobDataFor<T>;
    subject?: string;
  }): Promise<Job>;
  getByID(id: string): Promise<Job | null>;
  listAll(): Promise<Job[]>;
  markRunning(id: string): Promise<Job | null>;
  markSucceeded(id: string): Promise<Job | null>;
  markFailed(id: string, options: { error: string }): Promise<Job | null>;
  retryPublication(id: string): Promise<Job | null>;
  abandonPublication(id: string): Promise<Job | null>;
  deleteByID(id: string): Promise<Job | null>;
}

export function createJobService(options: JobServiceOptions): JobService {
  const source = eventAttributesSchema.shape.source.parse(options.source);
  const { logger, repository } = options;

  const logMutation = (operation: string, job: Job | null): Job | null => {
    if (job !== null) {
      logger.debug({ jobId: job.id, eventType: job.event.type, operation }, "Updated durable job");
    }

    return job;
  };

  return {
    async create(createOptions) {
      const event = createJobEvent({ ...createOptions, source });
      const createdAt = new Date(event.time);
      const job: Job = {
        id: event.id,
        event,
        publicationState: "pending",
        publicationAttempts: 0,
        nextPublicationAttemptAt: createdAt,
        lastPublicationError: null,
        publishedAt: null,
        abandonedAt: null,
        executionState: "pending",
        executionStartedAt: null,
        executionFinishedAt: null,
        executionError: null,
        createdAt,
        updatedAt: createdAt,
      };
      const insertedJob = await repository.insert(job);
      logger.debug(
        { jobId: insertedJob.id, eventType: insertedJob.event.type, operation: "create" },
        "Created durable job",
      );
      return insertedJob;
    },

    getByID(id) {
      return repository.getByID(id);
    },

    listAll() {
      return repository.listAll();
    },

    async markRunning(id) {
      return logMutation("markRunning", await repository.markRunning(id, new Date()));
    },

    async markSucceeded(id) {
      return logMutation("markSucceeded", await repository.markSucceeded(id, new Date()));
    },

    async markFailed(id, mutationOptions) {
      return logMutation(
        "markFailed",
        await repository.markFailed(id, mutationOptions.error, new Date()),
      );
    },

    async retryPublication(id) {
      return logMutation("retryPublication", await repository.retryPublication(id, new Date()));
    },

    async abandonPublication(id) {
      return logMutation("abandonPublication", await repository.abandonPublication(id, new Date()));
    },

    async deleteByID(id) {
      return logMutation("deleteByID", await repository.deleteByID(id));
    },
  };
}
