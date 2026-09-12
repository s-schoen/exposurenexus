import * as Pino from "pino";

import { env } from "./env.js";

export function createLogger(moduleName: string, options: Pino.LoggerOptions = {}): Pino.Logger {
  return Pino.pino({
    level: env.LOG_LEVEL,
    ...options,
  }).child({ name: moduleName });
}

export function createApiLoggers(level: string) {
  const loggerFactory = (moduleName: string) => createLogger(moduleName, { level });
  const logger = loggerFactory("api");
  const accessLogger = loggerFactory("audit/api");
  const infrastructureLogger = createLogger("infrastructure", {
    level,
    serializers: { err: () => "infrastructure error" },
    hooks: {
      logMethod(args, method) {
        const first = args[0];
        // Pino derives msg from the original error before running its err serializer.
        if (
          args[1] === undefined &&
          typeof first === "object" &&
          first !== null &&
          (first instanceof Error || "err" in first)
        ) {
          args[1] = "infrastructure error";
        }
        method.apply(this, args);
      },
    },
  });
  const dbLogger = infrastructureLogger.child({ name: "db" });

  return { logger, accessLogger, infrastructureLogger, dbLogger, loggerFactory };
}
