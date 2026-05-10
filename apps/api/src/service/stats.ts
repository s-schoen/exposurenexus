import {
  type FindingStatistics,
  FindingStatus
} from "@exposurenexus/types/model/finding"
import { HTTPException } from "hono/http-exception"
import { VulnerabilitySeverity } from "@exposurenexus/types/model/vulnerability"
import type { Logger } from "pino"
import type { FindingRepository } from "../repository/finding.js"

type FindingStatsRepository = Pick<FindingRepository, "countBy">

interface StatsServiceDependencies {
  findingRepository: FindingStatsRepository
  logger: Logger
}

function normalizeEnumCounts<E extends string>(
  enumObject: Record<string, E>,
  counts: Record<string, number>
): Record<E, number> {
  return Object.values(enumObject).reduce(
    (acc, key) => {
      acc[key] = counts[key] ?? 0
      return acc
    },
    {} as Record<E, number>
  )
}

export function createStatsService({
  findingRepository,
  logger
}: StatsServiceDependencies) {
  return {
    async getFindingStats(): Promise<FindingStatistics> {
      try {
        const severityCount = await findingRepository.countBy("severity")
        const statusCount = await findingRepository.countBy("status")
        const assetCount = await findingRepository.countBy("assetId")
        const sourceCount = await findingRepository.countBy("source")

        const total = Object.values(severityCount).reduce(
          (acc, v) => acc + v,
          0
        )

        return {
          total,
          status: normalizeEnumCounts(FindingStatus, statusCount),
          severity: normalizeEnumCounts(VulnerabilitySeverity, severityCount),
          assets: assetCount,
          source: sourceCount
        }
      } catch (error) {
        logger.error(error, `failed to get finding statistics`)
        throw new HTTPException(500, {
          message: "failed to retrieve statistics"
        })
      }
    }
  }
}
