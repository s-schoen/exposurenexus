import type { Job } from "./contracts/jobs.js";
import type { PublicationFailureOptions, PublicationSuccessOptions } from "./postgres.js";
import type { JobProducer } from "./producer.js";
import type { Logger } from "pino";

const DEFAULT_MAXIMUM_ATTEMPTS = 5;
const DEFAULT_RETRY_DELAY_MS = 5_000;
const DEFAULT_IDLE_POLL_INTERVAL_MS = 1_000;
const MAXIMUM_TIMER_DELAY_MS = 2_147_483_647;
const MAXIMUM_POSTGRES_INTEGER = 2_147_483_647;

export interface JobRelayRepository {
  getNextEligiblePublication(now: Date): Promise<Job | null>;
  recordPublicationSuccess(id: string, options: PublicationSuccessOptions): Promise<Job | null>;
  recordPublicationFailure(id: string, options: PublicationFailureOptions): Promise<Job | null>;
}

export interface JobRelayOptions {
  repository: JobRelayRepository;
  producer: JobProducer;
  logger: Logger;
  maximumAttempts?: number;
  retryDelayMs?: number;
  idlePollIntervalMs?: number;
}

export interface JobRelay {
  start(): Promise<void>;
  stop(): Promise<void>;
}

type RelayState = "ready" | "running" | "stopped";
type PublicationOutcome =
  | { kind: "success"; options: PublicationSuccessOptions }
  | { kind: "failure"; options: PublicationFailureOptions };

function validatePositiveInteger(name: string, value: number, maximum?: number): void {
  if (!Number.isSafeInteger(value) || value <= 0 || (maximum !== undefined && value > maximum)) {
    throw new RangeError(
      `${name} must be a positive integer${maximum ? ` no greater than ${maximum}` : ""}`,
    );
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function createJobRelay(options: JobRelayOptions): JobRelay {
  const maximumAttempts = options.maximumAttempts ?? DEFAULT_MAXIMUM_ATTEMPTS;
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  const idlePollIntervalMs = options.idlePollIntervalMs ?? DEFAULT_IDLE_POLL_INTERVAL_MS;

  validatePositiveInteger("maximumAttempts", maximumAttempts, MAXIMUM_POSTGRES_INTEGER);
  validatePositiveInteger("retryDelayMs", retryDelayMs, MAXIMUM_TIMER_DELAY_MS);
  validatePositiveInteger("idlePollIntervalMs", idlePollIntervalMs, MAXIMUM_TIMER_DELAY_MS);

  const logger = options.logger.child({ component: "job-relay" });
  const shutdown = new AbortController();
  let state: RelayState = "ready";
  let loopPromise: Promise<void> | undefined;

  function isRunning(): boolean {
    return state === "running";
  }

  function wait(delayMs: number): Promise<boolean> {
    if (shutdown.signal.aborted) {
      return Promise.resolve(false);
    }

    const { promise, resolve } = Promise.withResolvers<boolean>();
    const timer = setTimeout(() => {
      shutdown.signal.removeEventListener("abort", cancel);
      resolve(true);
    }, delayMs);
    timer.unref?.();

    function cancel(): void {
      clearTimeout(timer);
      resolve(false);
    }

    shutdown.signal.addEventListener("abort", cancel, { once: true });
    return promise;
  }

  async function persistOutcome(job: Job, outcome: PublicationOutcome): Promise<boolean> {
    while (isRunning()) {
      try {
        const storedJob =
          outcome.kind === "success"
            ? await options.repository.recordPublicationSuccess(job.id, outcome.options)
            : await options.repository.recordPublicationFailure(job.id, outcome.options);

        if (outcome.kind === "success") {
          logger.info(
            {
              jobId: job.id,
              type: job.event.type,
              publicationState: storedJob?.publicationState,
            },
            "job publication confirmed",
          );
        } else if (storedJob?.publicationState === "published") {
          logger.debug(
            {
              jobId: job.id,
              type: job.event.type,
              publicationState: storedJob.publicationState,
              publicationAttempts: storedJob.publicationAttempts,
            },
            "job publication failure reconciled with published state",
          );
        } else {
          logger.warn(
            {
              jobId: job.id,
              type: job.event.type,
              publicationState: storedJob?.publicationState,
              publicationAttempts: storedJob?.publicationAttempts,
              err: outcome.options.error,
            },
            "job publication failed",
          );
        }
        return true;
      } catch (error) {
        logger.error(
          { err: error, jobId: job.id, type: job.event.type, outcome: outcome.kind },
          "failed to record job publication outcome",
        );
        if (!isRunning() || !(await wait(retryDelayMs))) {
          return false;
        }
      }
    }
    return false;
  }

  async function runLoop(): Promise<void> {
    logger.info("job relay started");

    while (isRunning()) {
      let job: Job | null;
      try {
        job = await options.repository.getNextEligiblePublication(new Date());
      } catch (error) {
        logger.error({ err: error }, "job relay polling failed");
        if (!isRunning() || !(await wait(retryDelayMs))) {
          break;
        }
        continue;
      }

      if (!isRunning()) {
        break;
      }
      if (job === null) {
        logger.debug("no job is eligible for publication");
        if (!(await wait(idlePollIntervalMs))) {
          break;
        }
        continue;
      }

      logger.debug(
        {
          jobId: job.id,
          type: job.event.type,
          publicationState: job.publicationState,
          publicationAttempts: job.publicationAttempts,
        },
        "publishing job",
      );

      let outcome: PublicationOutcome;
      try {
        await options.producer.publish(job.event);
        const observedAt = new Date();
        outcome = {
          kind: "success",
          options: {
            expectedPublicationAttempts: job.publicationAttempts,
            updatedAt: observedAt,
          },
        };
      } catch (error) {
        const observedAt = new Date();
        outcome = {
          kind: "failure",
          options: {
            error: errorMessage(error),
            expectedPublicationAttempts: job.publicationAttempts,
            maximumAttempts,
            nextPublicationAttemptAt: new Date(observedAt.getTime() + retryDelayMs),
            updatedAt: observedAt,
          },
        };
      }

      if (!isRunning()) {
        break;
      }
      await persistOutcome(job, outcome);
    }

    logger.info("job relay stopped");
  }

  return {
    async start() {
      if (state === "running") {
        throw new Error("job relay is already started");
      }
      if (state === "stopped") {
        throw new Error("job relay has been permanently stopped");
      }

      state = "running";
      loopPromise = runLoop();
    },

    async stop() {
      if (state !== "stopped") {
        state = "stopped";
        shutdown.abort();
      }
      await loopPromise;
    },
  };
}
