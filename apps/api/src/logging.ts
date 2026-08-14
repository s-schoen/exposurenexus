import * as Pino from "pino";

import { env } from "./env.js";

export function createLogger(moduleName: string): Pino.Logger {
  return Pino.pino({
    level: env.LOG_LEVEL,
  }).child({ name: moduleName });
}
