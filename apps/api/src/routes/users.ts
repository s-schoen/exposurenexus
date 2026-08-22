import {
  createUserProfileSchema,
  updateUserProfileSchema,
} from "@exposurenexus/contracts/model/user";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod/v4";

import { notFound } from "../lib/api-error.js";
import { replyArray, replyObject } from "../lib/reply.js";
import { requestEventContext } from "../lib/request-event-context.js";

import type { ContextVariables } from "../lib/hono-schema.js";
import type { RequireDomainPermission } from "../middleware/auth.js";
import type { UserProfileService } from "../service/user-profile.js";

interface UserRouteDependencies {
  requireDomainPermission: RequireDomainPermission;
}

const idParamValidator = zValidator("param", z.object({ id: z.uuidv4() }));

export function createUserRoute(
  userService: UserProfileService,
  { requireDomainPermission }: UserRouteDependencies,
) {
  const user = new Hono<{ Variables: ContextVariables }>();

  user.get("/", requireDomainPermission("user", "read"), async (c) => {
    const users = await userService.listAll();
    return replyArray(c, users);
  });

  user.get("/:id", requireDomainPermission("user", "read"), idParamValidator, async (c) => {
    const params = c.req.valid("param");

    const userResult = await userService.getByID(params.id);
    if (!userResult) {
      throw notFound("user", params.id);
    }

    return replyObject(c, userResult);
  });

  user.post(
    "/",
    requireDomainPermission("user", "write"),
    zValidator("json", createUserProfileSchema),
    async (c) => {
      const body = c.req.valid("json");
      const createdUser = await userService.create(body, requestEventContext(c));
      return replyObject(c, createdUser, true);
    },
  );

  user.put(
    "/:id",
    requireDomainPermission("user", "write"),
    idParamValidator,
    zValidator("json", updateUserProfileSchema),
    async (c) => {
      const params = c.req.valid("param");
      const body = c.req.valid("json");

      const updatedUser = await userService.updateByID({
        id: params.id,
        userProfile: body,
        eventContext: requestEventContext(c),
      });
      if (!updatedUser) {
        throw notFound("user", params.id);
      }

      return replyObject(c, updatedUser);
    },
  );

  return user;
}
