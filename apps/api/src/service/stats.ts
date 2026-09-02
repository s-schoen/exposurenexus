import { ApplicationError } from "@exposurenexus/backend";
import { type FindingStatistics, FindingStatus } from "@exposurenexus/contracts/model/finding";
import { VulnerabilitySeverity } from "@exposurenexus/contracts/model/vulnerability";

import type { FindingRepository } from "../repository/finding.js";
import type { Logger } from "pino";

type FindingStatsRepository = Pick<FindingRepository, "countBy">;

interface StatsServiceDependencies {
  findingRepository: FindingStatsRepository;
  logger: Logger;
}

export interface StatsService {
  getFindingStats(): Promise<FindingStatistics>;
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

export function createStatsService({
  findingRepository,
  logger,
}: StatsServiceDependencies): StatsService {
  return {
    async getFindingStats(): Promise<FindingStatistics> {
      try {
        const severityCount = await findingRepository.countBy("severity");
        const statusCount = await findingRepository.countBy("status");
        const assetCount = await findingRepository.countBy("assetId");
        const total = Object.values(severityCount).reduce((acc, v) => acc + v, 0);

        return {
          total,
          status: normalizeEnumCounts(FindingStatus, statusCount),
          severity: normalizeEnumCounts(VulnerabilitySeverity, severityCount),
          assets: assetCount,
        };
      } catch (error) {
        logger.error(error, `failed to get finding statistics`);
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
