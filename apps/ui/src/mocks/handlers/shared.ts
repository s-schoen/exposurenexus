import { DEFAULT_ACTOR_ID, fixtureId, nextFixtureSequence } from "@/mocks/fixtures/ids.ts";
import { replyError } from "@/mocks/reply.ts";

import type { MockDb } from "@/mocks/db.ts";
import type { FixtureKind } from "@/mocks/fixtures/ids.ts";
import type { PermissionResource, PermissionVerb } from "@exposurenexus/contracts/model/rbac";
import type { HttpResponseResolver, PathParams } from "msw";

/** Matches the API path on any origin, so `VITE_API_URL` and the test origin don't matter. */
export function apiPath(path: string): string {
  return `*/api${path}`;
}

/** Ids for records created through handlers share the builder sequences, so they never collide. */
export function newId(kind: FixtureKind): string {
  return fixtureId(kind, nextFixtureSequence(kind));
}

export function actorId(db: MockDb): string {
  return db.session?.user.id ?? DEFAULT_ACTOR_ID;
}

export function createdAudit(db: MockDb) {
  const now = new Date();
  return { createdAt: now, updatedAt: now, createdBy: actorId(db), updatedBy: actorId(db) };
}

export function updatedAudit(db: MockDb) {
  return { updatedAt: new Date(), updatedBy: actorId(db) };
}

/** Whether the signed-in user's roles, as currently stored in `db`, grant `verb` on `resource`. */
export function hasPermission(
  db: MockDb,
  resource: PermissionResource,
  verb: PermissionVerb,
): boolean {
  if (!db.session) {
    return false;
  }
  const user = db.users.get(db.session.user.id) ?? db.session.user;
  return user.roleIds.some((roleId) =>
    db.roles
      .get(roleId)
      ?.permissions.some(
        (permission) => permission.resource === resource && permission.verb === verb,
      ),
  );
}

/**
 * Like the API's `requireDomainPermission(resource, verb)`: answers 403 unless the signed-in
 * user may do this. Sign in as a user with fewer roles (`db.session`) to test denied requests.
 */
export function requirePermission<Params extends PathParams<keyof Params>>(
  db: MockDb,
  resource: PermissionResource,
  verb: PermissionVerb,
  resolver: HttpResponseResolver<Params>,
): HttpResponseResolver<Params> {
  return (info) =>
    hasPermission(db, resource, verb) ? resolver(info) : replyError(403, "Forbidden");
}
