import { vulnerabilityInputSchema } from "@exposurenexus/contracts/model/vulnerability";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod/v4";

import { notFound, unauthorized } from "../lib/api-error.js";
import { replyArray, replyObject } from "../lib/reply.js";
import { requestEventContext } from "../lib/request-event-context.js";

import type { ContextVariables } from "../lib/hono-schema.js";
import type { RequireDomainPermission } from "../middleware/auth.js";
import type { VulnerabilityService } from "../service/vulnerability.js";

interface VulnerabilityRouteDependencies {
  requireDomainPermission: RequireDomainPermission;
}

const idParamValidator = zValidator("param", z.object({ id: z.uuidv4() }));

export function createVulnerabilityRoute(
  vulnerabilityService: VulnerabilityService,
  { requireDomainPermission }: VulnerabilityRouteDependencies,
) {
  const vulnerability = new Hono<{ Variables: ContextVariables }>();

  vulnerability.get("/", requireDomainPermission("vulnerability", "read"), async (c) => {
    return replyArray(c, await vulnerabilityService.listAll());
  });

  vulnerability.post(
    "/",
    requireDomainPermission("vulnerability", "write"),
    zValidator("json", vulnerabilityInputSchema),
    async (c) => {
      const user = c.get("user");
      if (!user) {
        throw unauthorized();
      }

      const createdVulnerability = await vulnerabilityService.create({
        vulnerability: c.req.valid("json"),
        user,
        eventContext: requestEventContext(c),
      });

      return replyObject(c, createdVulnerability, true);
    },
  );

  vulnerability.get(
    "/:id",
    requireDomainPermission("vulnerability", "read"),
    idParamValidator,
    async (c) => {
      const { id } = c.req.valid("param");
      const vulnerabilityResult = await vulnerabilityService.getByID(id);
      if (!vulnerabilityResult) {
        throw notFound("vulnerability", id);
      }

      return replyObject(c, vulnerabilityResult);
    },
  );

  vulnerability.put(
    "/:id",
    requireDomainPermission("vulnerability", "write"),
    idParamValidator,
    zValidator("json", vulnerabilityInputSchema),
    async (c) => {
      const user = c.get("user");
      if (!user) {
        throw unauthorized();
      }

      const { id } = c.req.valid("param");
      const updatedVulnerability = await vulnerabilityService.updateByID({
        id,
        vulnerability: c.req.valid("json"),
        user,
        eventContext: requestEventContext(c),
      });
      if (!updatedVulnerability) {
        throw notFound("vulnerability", id);
      }

      return replyObject(c, updatedVulnerability);
    },
  );

  vulnerability.delete(
    "/:id",
    requireDomainPermission("vulnerability", "delete"),
    idParamValidator,
    async (c) => {
      const { id } = c.req.valid("param");
      const deletedVulnerability = await vulnerabilityService.deleteByID(
        id,
        requestEventContext(c),
      );
      if (!deletedVulnerability) {
        throw notFound("vulnerability", id);
      }

      return replyObject(c, deletedVulnerability);
    },
  );

  return vulnerability;
}
