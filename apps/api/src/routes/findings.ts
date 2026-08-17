import {
  createFindingSchema,
  legacyCreateFindingSchema,
  updateFindingSchema,
} from "@exposurenexus/types/model/finding";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod/v4";

import { notFound, unauthorized } from "../lib/api-error.js";
import { replyArray, replyObject } from "../lib/reply.js";
import { requestEventContext } from "../lib/request-event-context.js";

import type { ContextVariables } from "../lib/hono-schema.js";
import type { RequireDomainPermission } from "../middleware/auth.js";
import type { FindingService } from "../service/finding.js";

interface FindingRouteDependencies {
  requireDomainPermission: RequireDomainPermission;
}

const idParamValidator = zValidator("param", z.object({ id: z.uuidv4() }));
const vulnerabilityLinkParamValidator = zValidator(
  "param",
  z.object({ findingId: z.uuidv4(), vulnerabilityId: z.uuidv4() }),
);
const createFindingRequestSchema = z.union([createFindingSchema, legacyCreateFindingSchema]);

export function createFindingRoute(
  findingService: FindingService,
  { requireDomainPermission }: FindingRouteDependencies,
) {
  const finding = new Hono<{ Variables: ContextVariables }>();

  finding.get("/", requireDomainPermission("finding", "read"), async (c) => {
    const findings = await findingService.listAll();
    return replyArray(c, findings);
  });

  finding.get("/:id", requireDomainPermission("finding", "read"), idParamValidator, async (c) => {
    const params = c.req.valid("param");

    const findingResult = await findingService.getByID(params.id);
    if (!findingResult) {
      throw notFound("finding", params.id);
    }

    return replyObject(c, findingResult);
  });

  finding.put(
    "/:findingId/vulnerabilities/:vulnerabilityId",
    requireDomainPermission("finding", "write"),
    vulnerabilityLinkParamValidator,
    async (c) => {
      const user = c.get("user");
      if (!user) {
        throw unauthorized();
      }

      const params = c.req.valid("param");
      const result = await findingService.linkVulnerability({
        findingId: params.findingId,
        vulnerabilityId: params.vulnerabilityId,
        user,
        eventContext: requestEventContext(c),
      });
      if (!result) {
        throw notFound("finding", params.findingId);
      }

      return replyObject(c, result.finding, result.changed);
    },
  );

  finding.delete(
    "/:findingId/vulnerabilities/:vulnerabilityId",
    requireDomainPermission("finding", "write"),
    vulnerabilityLinkParamValidator,
    async (c) => {
      const user = c.get("user");
      if (!user) {
        throw unauthorized();
      }

      const params = c.req.valid("param");
      const result = await findingService.unlinkVulnerability({
        findingId: params.findingId,
        vulnerabilityId: params.vulnerabilityId,
        user,
        eventContext: requestEventContext(c),
      });
      if (!result) {
        throw notFound("finding", params.findingId);
      }

      return replyObject(c, result.finding);
    },
  );

  finding.post(
    "/",
    requireDomainPermission("finding", "write"),
    zValidator("json", createFindingRequestSchema),
    async (c) => {
      const body = c.req.valid("json");
      const user = c.get("user");

      if (!user) {
        throw unauthorized();
      }

      const createdFinding =
        "vulnerabilityId" in body
          ? await findingService.create({
              finding: body,
              user,
              eventContext: requestEventContext(c),
            })
          : await findingService.createManual({
              finding: body,
              user,
              eventContext: requestEventContext(c),
            });

      return replyObject(c, createdFinding, true);
    },
  );

  finding.put(
    "/:id",
    requireDomainPermission("finding", "write"),
    idParamValidator,
    zValidator("json", updateFindingSchema),
    async (c) => {
      const body = c.req.valid("json");
      const params = c.req.valid("param");
      const user = c.get("user");

      if (!user) {
        throw unauthorized();
      }

      const updatedFinding = await findingService.updateByID({
        id: params.id,
        finding: body,
        user,
        eventContext: requestEventContext(c),
      });

      if (!updatedFinding) {
        throw notFound("finding", params.id);
      }

      return replyObject(c, updatedFinding);
    },
  );

  finding.delete(
    "/:id",
    requireDomainPermission("finding", "delete"),
    idParamValidator,
    async (c) => {
      const params = c.req.valid("param");
      const user = c.get("user");

      if (!user) {
        throw unauthorized();
      }

      const deleted = await findingService.deleteByID(params.id, requestEventContext(c));
      if (!deleted) {
        throw notFound("finding", params.id);
      }

      return replyObject(c, deleted);
    },
  );

  return finding;
}
