import { createRoleSchema, updateRoleSchema } from "@exposurenexus/contracts/model/rbac";
import {
  createUserProfileSchema,
  updateUserProfileSchema,
} from "@exposurenexus/contracts/model/user";
import { delay, http } from "msw";

import { apiPath, newId } from "@/mocks/handlers/shared.ts";
import { parseRequestBody, replyArray, replyNotFound, replyObject } from "@/mocks/reply.ts";

import type { MockDb } from "@/mocks/db.ts";

export function createUserHandlers(db: MockDb) {
  return [
    http.get(apiPath("/users"), async () => {
      await delay();
      return replyArray(db.users.all());
    }),

    http.post(apiPath("/users"), async ({ request }) => {
      await delay();
      const body = await parseRequestBody(request, createUserProfileSchema);
      if ("reply" in body) {
        return body.reply;
      }
      const { password: _, ...profile } = body.data;
      const user = { ...profile, id: newId("user") };
      db.users.insert(user);
      return replyObject(user, { created: true });
    }),

    http.get<{ id: string }>(apiPath("/users/:id"), async ({ params }) => {
      await delay();
      const user = db.users.get(params.id);
      return user ? replyObject(user) : replyNotFound("user");
    }),

    http.put<{ id: string }>(apiPath("/users/:id"), async ({ params, request }) => {
      await delay();
      const body = await parseRequestBody(request, updateUserProfileSchema);
      if ("reply" in body) {
        return body.reply;
      }
      const { password: _, ...profile } = body.data;
      const user = db.users.update(params.id, profile);
      return user ? replyObject(user) : replyNotFound("user");
    }),
  ];
}

export function createRoleHandlers(db: MockDb) {
  return [
    http.get(apiPath("/roles"), async () => {
      await delay();
      return replyArray(db.roles.all());
    }),

    http.post(apiPath("/roles"), async ({ request }) => {
      await delay();
      const body = await parseRequestBody(request, createRoleSchema);
      if ("reply" in body) {
        return body.reply;
      }
      const role = { ...body.data, name: body.data.name.trim(), id: newId("role") };
      db.roles.insert(role);
      return replyObject(role, { created: true });
    }),

    http.get<{ id: string }>(apiPath("/roles/:id"), async ({ params }) => {
      await delay();
      const role = db.roles.get(params.id);
      return role ? replyObject(role) : replyNotFound("role");
    }),

    http.put<{ id: string }>(apiPath("/roles/:id"), async ({ params, request }) => {
      await delay();
      const body = await parseRequestBody(request, updateRoleSchema);
      if ("reply" in body) {
        return body.reply;
      }
      const role = db.roles.update(params.id, { ...body.data, name: body.data.name.trim() });
      return role ? replyObject(role) : replyNotFound("role");
    }),

    http.delete<{ id: string }>(apiPath("/roles/:id"), async ({ params }) => {
      await delay();
      const role = db.roles.remove(params.id);
      if (!role) {
        return replyNotFound("role");
      }
      for (const user of db.users.all()) {
        db.users.update(user.id, { roleIds: user.roleIds.filter((id) => id !== role.id) });
      }
      return replyObject(role);
    }),
  ];
}
