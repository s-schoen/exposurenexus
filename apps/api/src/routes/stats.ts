import { Hono } from "hono"
import { replyObject } from "../lib/reply.js"

interface StatsRouteService {
  getFindingStats(): Promise<object>
}

export function createFindingStatsRoute(statsService: StatsRouteService) {
  const findingStats = new Hono()

  findingStats.get("/stats", async (c) => {
    const status = await statsService.getFindingStats()
    return replyObject(c, status)
  })

  return findingStats
}
