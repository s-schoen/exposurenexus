import { Hono } from "hono";

import { replyObject } from "../lib/reply.js";

import type { ContextVariables } from "../lib/hono-schema.js";
import type { RequireDomainPermission } from "../middleware/auth.js";
import type { Statistics } from "@exposurenexus/backend/statistics";

interface StatsRouteDependencies {
  requireDomainPermission: RequireDomainPermission;
}

export function createFindingStatsRoute(
  statsService: Statistics,
  { requireDomainPermission }: StatsRouteDependencies,
) {
  const findingStats = new Hono<{ Variables: ContextVariables }>();

  findingStats.get("/stats", requireDomainPermission("stats", "read"), async (c) => {
    const status = await statsService.getFindingStats();
    return replyObject(c, status);
  });

  return findingStats;
}
