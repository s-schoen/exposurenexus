import * as Pino from "pino";

import { env } from "./env.js";

export function createLogger(moduleName: string, options: Pino.LoggerOptions = {}): Pino.Logger {
  return Pino.pino({
    ...options,
    level: env.LOG_LEVEL,
  }).child({ name: moduleName });
}
