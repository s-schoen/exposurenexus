import {
  PermissionResource,
  PermissionVerb,
  builtInRoleIds,
  createRoleSchema,
  updateRoleSchema,
} from "@exposurenexus/contracts/model/rbac";
import {
  createUserProfileSchema,
  updateUserProfileSchema,
} from "@exposurenexus/contracts/model/user";
import { delay, http } from "msw";

import { apiPath, newId, requirePermission } from "@/mocks/handlers/shared.ts";
import {
  parseRequestBody,
  replyArray,
  replyError,
  replyNotFound,
  replyObject,
} from "@/mocks/reply.ts";

import type { MockDb } from "@/mocks/db.ts";
import type { UserProfile } from "@exposurenexus/contracts/model/user";

const { User } = PermissionResource;
const { Read, Write, Delete } = PermissionVerb;

const BUILT_IN_ROLE_IDS: ReadonlyArray<string> = Object.values(builtInRoleIds);

export function createUserHandlers(db: MockDb) {
  /** The API's unique username and email constraints, and its role foreign key. */
  const rejectUser = (profile: Omit<UserProfile, "id">, id?: string) => {
    const taken = db.users
      .all()
      .some(
        (user) =>
          user.id !== id && (user.username === profile.username || user.email === profile.email),
      );
    if (taken) {
      return replyError(409, "user profile already exists");
    }
    if (!profile.roleIds.every((roleId) => db.roles.get(roleId))) {
      return replyError(400, "invalid user role assignment");
    }
    return undefined;
  };

  return [
    http.get(
      apiPath("/users"),
      requirePermission(db, User, Read, async () => {
        await delay();
        return replyArray(db.users.all());
      }),
    ),

    http.post(
      apiPath("/users"),
      requirePermission(db, User, Write, async ({ request }) => {
        await delay();
        const body = await parseRequestBody(request, createUserProfileSchema);
        if ("reply" in body) {
          return body.reply;
        }
        const { password: _, ...profile } = body.data;
        const rejected = rejectUser(profile);
        if (rejected) {
          return rejected;
        }
        const user = { ...profile, id: newId("user") };
        db.users.insert(user);
        return replyObject(user, { created: true });
      }),
    ),

    http.get<{ id: string }>(
      apiPath("/users/:id"),
      requirePermission(db, User, Read, async ({ params }) => {
        await delay();
        const user = db.users.get(params.id);
        return user ? replyObject(user) : replyNotFound("user", params.id);
      }),
    ),

    // The username can't change: the update body has none, and the stored one is kept.
    http.put<{ id: string }>(
      apiPath("/users/:id"),
      requirePermission(db, User, Write, async ({ params, request }) => {
        await delay();
        const body = await parseRequestBody(request, updateUserProfileSchema);
        if ("reply" in body) {
          return body.reply;
        }
        const existing = db.users.get(params.id);
        if (!existing) {
          return replyNotFound("user", params.id);
        }
        const { password: _, ...profile } = body.data;
        const rejected = rejectUser({ ...profile, username: existing.username }, existing.id);
        if (rejected) {
          return rejected;
        }
        return replyObject(db.users.update(existing.id, profile)!);
      }),
    ),
  ];
}

export function createRoleHandlers(db: MockDb) {
  const nameTaken = (name: string, id?: string) =>
    db.roles.all().some((role) => role.id !== id && role.name === name);

  return [
    http.get(
      apiPath("/roles"),
      requirePermission(db, User, Read, async () => {
        await delay();
        return replyArray(db.roles.all());
      }),
    ),

    http.post(
      apiPath("/roles"),
      requirePermission(db, User, Write, async ({ request }) => {
        await delay();
        const body = await parseRequestBody(request, createRoleSchema);
        if ("reply" in body) {
          return body.reply;
        }
        const name = body.data.name.trim();
        if (nameTaken(name)) {
          return replyError(409, "role already exists");
        }
        const role = { ...body.data, name, id: newId("role") };
        db.roles.insert(role);
        return replyObject(role, { created: true });
      }),
    ),

    http.get<{ id: string }>(
      apiPath("/roles/:id"),
      requirePermission(db, User, Read, async ({ params }) => {
        await delay();
        const role = db.roles.get(params.id);
        return role ? replyObject(role) : replyNotFound("role", params.id);
      }),
    ),

    http.put<{ id: string }>(
      apiPath("/roles/:id"),
      requirePermission(db, User, Write, async ({ params, request }) => {
        await delay();
        const body = await parseRequestBody(request, updateRoleSchema);
        if ("reply" in body) {
          return body.reply;
        }
        if (BUILT_IN_ROLE_IDS.includes(params.id)) {
          return replyError(403, "built-in roles cannot be modified");
        }
        if (!db.roles.get(params.id)) {
          return replyNotFound("role", params.id);
        }
        const name = body.data.name.trim();
        if (nameTaken(name, params.id)) {
          return replyError(409, "role already exists");
        }
        return replyObject(db.roles.update(params.id, { ...body.data, name })!);
      }),
    ),

    http.delete<{ id: string }>(
      apiPath("/roles/:id"),
      requirePermission(db, User, Delete, async ({ params }) => {
        await delay();
        if (BUILT_IN_ROLE_IDS.includes(params.id)) {
          return replyError(403, "built-in roles cannot be modified");
        }
        const role = db.roles.get(params.id);
        if (!role) {
          return replyNotFound("role", params.id);
        }
        if (db.users.all().some((user) => user.roleIds.includes(role.id))) {
          return replyError(409, `role ${role.name} is still assigned to users`);
        }
        db.roles.remove(role.id);
        return replyObject(role);
      }),
    ),
  ];
}
