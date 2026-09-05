import { FindingStatus, type FindingStatistics } from "@exposurenexus/contracts/model/finding";
import { VulnerabilitySeverity } from "@exposurenexus/contracts/model/vulnerability";

import { ApplicationError } from "../application-error.js";

import type { DatabaseExecutor } from "../database/executor.js";
import type { Database } from "../database/index.js";
import type { FindingCountField } from "./statistics-persistence.js";
import type { Kysely } from "kysely";
import type { Logger } from "pino";

interface StatisticsPersistence {
  countFindingsBy(
    database: DatabaseExecutor,
    field: FindingCountField,
  ): Promise<Record<string, number>>;
}

export interface ExposureStatistics {
  getFindingStats(): Promise<FindingStatistics>;
}

interface StatisticsDependencies {
  database: Kysely<Database>;
  statisticsPersistence: StatisticsPersistence;
  logger: Logger;
}

function normalizeEnumCounts<E extends string>(
  enumObject: Record<string, E>,
  counts: Record<string, number>,
): Record<E, number> {
  return Object.values(enumObject).reduce(
    (acc, key) => {
      acc[key] = counts[key] ?? 0;
      return acc;
    },
    {} as Record<E, number>,
  );
}

export function createStatistics({
  database,
  statisticsPersistence,
  logger,
}: StatisticsDependencies): ExposureStatistics {
  return {
    async getFindingStats(): Promise<FindingStatistics> {
      try {
        const severityCount = await statisticsPersistence.countFindingsBy(database, "severity");
        const statusCount = await statisticsPersistence.countFindingsBy(database, "status");
        const assetCount = await statisticsPersistence.countFindingsBy(database, "assetId");
        const total = Object.values(severityCount).reduce((acc, value) => acc + value, 0);

        return {
          total,
          status: normalizeEnumCounts(FindingStatus, statusCount),
          severity: normalizeEnumCounts(VulnerabilitySeverity, severityCount),
          assets: assetCount,
        };
      } catch (error) {
        logger.error(error, "failed to get finding statistics");
        throw new ApplicationError({
          code: "stats.get_finding_stats_failed",
          kind: "unexpected",
          message: "failed to retrieve statistics",
          cause: error,
        });
      }
    },
  };
}
