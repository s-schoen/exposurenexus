import { pino } from "pino";

import type { WorkerConfig } from "./env.js";

export function createLogger(level: WorkerConfig["LOG_LEVEL"] = "info") {
  return pino({ level, base: { name: "worker" } });
}
