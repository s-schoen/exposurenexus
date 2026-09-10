import { z } from "zod/v4";

const milliseconds = z.coerce.number().int().min(1).max(2_147_483_647);
const schema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  RABBITMQ_URL: z.url({ protocol: /^amqps?$/ }),
  RABBITMQ_QUEUE: z.string().trim().min(1).default("EXPOSURENEXUS_JOBS_INGEST"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  SHUTDOWN_TIMEOUT_MS: milliseconds.default(60_000),
  STARTUP_TIMEOUT_MS: milliseconds.default(30_000),
});

export type WorkerConfig = z.output<typeof schema>;

export class WorkerConfigurationError extends Error {
  constructor(fields: (keyof WorkerConfig)[]) {
    super(`Invalid worker configuration: ${fields.join(", ")}`);
  }
}

export function readConfig(environment: NodeJS.ProcessEnv): WorkerConfig {
  const result = schema.safeParse(
    Object.fromEntries(
      Object.entries(environment).map(([key, value]) => [key, value === "" ? undefined : value]),
    ),
  );
  if (!result.success) {
    // Validation messages/inputs can contain credentials; report field names only.
    const fields = [
      ...new Set(result.error.issues.map((issue) => issue.path[0] as keyof WorkerConfig)),
    ];
    throw new WorkerConfigurationError(fields);
  }
  return result.data;
}
