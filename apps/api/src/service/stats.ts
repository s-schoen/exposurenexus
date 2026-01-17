import * as findingRepository from "../repository/finding.js"
import {
  type FindingStatistics,
  FindingSeverity,
  FindingStatus
} from "@openvlp/types/model/finding"
import { createLogger } from "../logging.js"
import { HTTPException } from "hono/http-exception"

const logger = createLogger("service/stats")

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

export async function getFindingStats(): Promise<FindingStatistics> {
  try {
    const severityCount = await findingRepository.countBy("severity")
    const statusCount = await findingRepository.countBy("status")
    const assetCount = await findingRepository.countBy("assetId")
    const sourceCount = await findingRepository.countBy("source")

    const total = Object.values(severityCount).reduce((acc, v) => acc + v, 0)

    return {
      total,
      status: normalizeEnumCounts(FindingStatus, statusCount),
      severity: normalizeEnumCounts(FindingSeverity, severityCount),
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
