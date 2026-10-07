import { isDeepStrictEqual } from "node:util";

import { assetIdentifierSchema } from "@exposurenexus/backend/assets";
import { fingerprintsSchema, weaknessSchema } from "@exposurenexus/backend/findings";
import { observationAffectedResourceSchema } from "@exposurenexus/contracts/model/affected-resource";
import { VulnerabilitySeverity } from "@exposurenexus/contracts/model/vulnerability";
import { z } from "zod/v4";

import type { ObservationCandidate } from "../classifier.js";

// Hand-authored evaluation fixtures, unlike classifier output, need full preflight validation.
export const candidateSchema = z.strictObject({
  source: z.string(),
  sourceRecord: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  remediation: z.string().nullable(),
  evidence: z.string().nullable(),
  severity: z.enum(VulnerabilitySeverity),
  weakness: weaknessSchema,
  affectedResource: observationAffectedResourceSchema,
  observedAt: z.date().nullable(),
  assetIdentifierCandidates: z.array(assetIdentifierSchema),
  fingerprints: fingerprintsSchema,
  sourceMetadata: z.record(z.string(), z.unknown()),
}) satisfies z.ZodType<ObservationCandidate>;

const tagPattern = /^[a-z0-9][a-z0-9._:/-]*$/i;

/** Throws unless the value parses and is already in the schema's canonical form. */
export function assertCanonical(schema: z.ZodType, value: unknown, message: string) {
  const parsed = schema.safeParse(value);
  if (!parsed.success || !isDeepStrictEqual(parsed.data, value)) throw new Error(message);
}

export function uniqueIds(entries: { id: string }[], kind: string) {
  if (
    entries.some(
      (entry) => typeof entry.id !== "string" || !/^[a-z0-9][a-z0-9._-]*$/i.test(entry.id),
    )
  ) {
    throw new Error(`Invalid ${kind} ID; use letters, digits, dots, underscores, and hyphens.`);
  }
  const ids = new Set(entries.map((entry) => entry.id));
  if (ids.size !== entries.length) throw new Error(`Duplicate ${kind} IDs.`);
  return ids;
}

export function validateTags(tags: unknown, context: string) {
  if (
    tags !== undefined &&
    (!Array.isArray(tags) || tags.some((tag) => typeof tag !== "string" || !tagPattern.test(tag)))
  ) {
    throw new Error(`Invalid tag in ${context}.`);
  }
}

export function validateNote(note: unknown, context: string) {
  if (note !== undefined && (typeof note !== "string" || note.trim().length === 0)) {
    throw new Error(`Notes must not be empty in ${context}.`);
  }
}
