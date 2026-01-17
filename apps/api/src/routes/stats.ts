import { Hono } from "hono"
import * as statsService from "../service/stats.js"
import { replyObject } from "../lib/reply.js"

const findingStats = new Hono()

findingStats.get("/stats", async (c) => {
  const status = await statsService.getFindingStats()
  return replyObject(c, status)
})

export { findingStats }
