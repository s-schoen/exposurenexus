import { DEFAULT_ACTOR_ID, fixtureId, nextFixtureSequence } from "@/mocks/fixtures/ids.ts";

import type { MockDb } from "@/mocks/db.ts";
import type { FixtureKind } from "@/mocks/fixtures/ids.ts";

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
