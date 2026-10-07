import { z } from "zod/v4";

const namespacePattern = /^[a-z][a-z\d._-]*$/u;
const namespaceSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    namespacePattern,
    "Fingerprint namespaces must contain letters, numbers, dots, underscores, or hyphens.",
  );
const fingerprintSchema = z.string().trim().min(1, "Fingerprints must not be empty.");

/**
 * Canonical source fingerprints: namespaces are lowercased and sorted, values are opaque,
 * deduplicated, and sorted, and empty namespaces are removed.
 */
export const fingerprintsSchema = z
  .record(namespaceSchema, z.array(fingerprintSchema))
  .transform((fingerprints) => {
    const result: Record<string, string[]> = {};

    for (const namespace of Object.keys(fingerprints).sort()) {
      const values = new Set(fingerprints[namespace]);
      if (values.size > 0) {
        result[namespace] = [...values].sort();
      }
    }

    return result;
  });

export type Fingerprints = z.output<typeof fingerprintsSchema>;
