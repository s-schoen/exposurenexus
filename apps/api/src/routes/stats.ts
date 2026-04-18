import { Hono } from "hono"
import { replyObject } from "../lib/reply.js"
import type { ContextVariables } from "../lib/hono-schema.js"
import { requireDomainPermission } from "../middleware/auth.js"

interface StatsRouteService {
  getFindingStats(): Promise<object>
}

export function createFindingStatsRoute(statsService: StatsRouteService) {
  const findingStats = new Hono<{ Variables: ContextVariables }>()

  findingStats.get(
    "/stats",
    requireDomainPermission("stats", "read"),
    async (c) => {
      const status = await statsService.getFindingStats()
      return replyObject(c, status)
    }
  )

  return findingStats
}
