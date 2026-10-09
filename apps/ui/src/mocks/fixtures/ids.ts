const FIXTURE_EPOCH = Date.parse("2026-01-01T00:00:00.000Z");
const DAY_IN_MS = 24 * 60 * 60 * 1000;

// One hex digit per kind keeps builder ids unique across resources.
const FIXTURE_KIND_CODES = {
  asset: "1",
  assetIdentifier: "2",
  customField: "3",
  customFieldOption: "4",
  finding: "5",
  observation: "6",
  role: "7",
  session: "8",
  user: "9",
  vulnerability: "a",
} as const;

export type FixtureKind = keyof typeof FIXTURE_KIND_CODES;

/** Seeded admin user; builders use it as the default `createdBy`/`updatedBy` actor. */
export const DEFAULT_ACTOR_ID = "f74d7ff2-2d81-4d1e-9fa9-73af7d46a37d";

const sequences = new Map<FixtureKind, number>();

export function nextFixtureSequence(kind: FixtureKind): number {
  const next = (sequences.get(kind) ?? 0) + 1;
  sequences.set(kind, next);
  return next;
}

export function resetFixtureSequences(): void {
  sequences.clear();
}

/** Deterministic UUIDv4-shaped id, e.g. `50000000-0000-4000-8000-000000000003`. */
export function fixtureId(kind: FixtureKind, sequence: number): string {
  const suffix = sequence.toString(16).padStart(12, "0");
  return `${FIXTURE_KIND_CODES[kind]}0000000-0000-4000-8000-${suffix}`;
}

/** Fixed date `days` after 2026-01-01T00:00:00Z. */
export function fixtureDate(days = 0): Date {
  return new Date(FIXTURE_EPOCH + days * DAY_IN_MS);
}
