import {
  getOrCreateRuntimeValue,
  getRuntimeDatabase,
  getRuntimeLogger,
  type BackendRuntime,
} from "../../runtime.js";
import * as statisticsPersistence from "./statistics-persistence.js";
import { createStatisticsBehavior, type Statistics } from "./statistics.js";

export type { Statistics } from "./statistics.js";

const statisticsRuntimeKey = {};

export function createStatistics(runtime: BackendRuntime): Statistics {
  return getOrCreateRuntimeValue(runtime, statisticsRuntimeKey, () =>
    createStatisticsBehavior({
      database: getRuntimeDatabase(runtime),
      statisticsPersistence,
      logger: getRuntimeLogger(runtime).child({ capability: "exposures", component: "statistics" }),
    }),
  );
}
