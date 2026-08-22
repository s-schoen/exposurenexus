import { createRoleSchema, updateRoleSchema } from "@exposurenexus/contracts/model/rbac";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod/v4";

import { notFound } from "../lib/api-error.js";
import { replyArray, replyObject } from "../lib/reply.js";
import { requestEventContext } from "../lib/request-event-context.js";

import type { ContextVariables } from "../lib/hono-schema.js";
import type { RequireDomainPermission } from "../middleware/auth.js";
import type { RoleService } from "../service/role.js";

interface RoleRouteDependencies {
  requireDomainPermission: RequireDomainPermission;
}

const idParamValidator = zValidator("param", z.object({ id: z.uuidv4() }));

export function createRoleRoute(
  roleService: RoleService,
  { requireDomainPermission }: RoleRouteDependencies,
) {
  const role = new Hono<{ Variables: ContextVariables }>();

  role.get("/", requireDomainPermission("user", "read"), async (c) => {
    const roles = await roleService.listAll();
    return replyArray(c, roles);
  });

  role.post(
    "/",
    requireDomainPermission("user", "write"),
    zValidator("json", createRoleSchema),
    async (c) => {
      const body = c.req.valid("json");

      const createdRole = await roleService.create(body, requestEventContext(c));

      return replyObject(c, createdRole, true);
    },
  );

  role.get("/:id", requireDomainPermission("user", "read"), idParamValidator, async (c) => {
    const params = c.req.valid("param");

    const roleResult = await roleService.getByID(params.id);
    if (!roleResult) {
      throw notFound("role", params.id);
    }

    return replyObject(c, roleResult);
  });

  role.put(
    "/:id",
    requireDomainPermission("user", "write"),
    idParamValidator,
    zValidator("json", updateRoleSchema),
    async (c) => {
      const params = c.req.valid("param");
      const body = c.req.valid("json");

      const updatedRole = await roleService.updateByID({
        id: params.id,
        role: body,
        eventContext: requestEventContext(c),
      });
      if (!updatedRole) {
        throw notFound("role", params.id);
      }

      return replyObject(c, updatedRole);
    },
  );

  role.delete("/:id", requireDomainPermission("user", "delete"), idParamValidator, async (c) => {
    const params = c.req.valid("param");

    const deletedRole = await roleService.deleteByID(params.id, requestEventContext(c));
    if (!deletedRole) {
      throw notFound("role", params.id);
    }

    return replyObject(c, deletedRole);
  });

  return role;
}
