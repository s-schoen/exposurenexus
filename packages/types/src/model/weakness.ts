import { z } from "zod/v4";

const namespacePattern = /^[a-z][a-z\d._-]*$/u;
const cvePattern = /^cve-(\d{4})-(\d{4,})$/iu;
const cwePattern = /^cwe-(\d+)$/iu;
const ghsaPattern = /^ghsa-([a-z\d]{4})-([a-z\d]{4})-([a-z\d]{4})$/iu;

function sortStrings(values: Iterable<string>): string[] {
  return [...values].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}

function normalizeNamespace(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  return namespacePattern.test(normalized) ? normalized : null;
}

function normalizeKnownIdentifier(namespace: string, value: string): string {
  switch (namespace) {
    case "cve": {
      const match = cvePattern.exec(value);
      return match === null ? value : `CVE-${match[1]}-${match[2]}`;
    }
    case "cwe": {
      const match = cwePattern.exec(value);
      return match === null ? value : `CWE-${match[1]}`;
    }
    case "ghsa": {
      const match = ghsaPattern.exec(value);
      return match === null
        ? value
        : `GHSA-${match[1].toUpperCase()}-${match[2].toUpperCase()}-${match[3].toUpperCase()}`;
    }
    default:
      return value;
  }
}

const rawWeaknessIdentifiersSchema = z.record(z.string(), z.array(z.string()));

export const weaknessIdentifiersSchema = rawWeaknessIdentifiersSchema.transform(
  (identifiers, context) => {
    const normalized: Record<string, Set<string>> = {};

    for (const [rawNamespace, rawValues] of Object.entries(identifiers)) {
      const namespace = normalizeNamespace(rawNamespace);
      if (namespace === null) {
        context.addIssue({
          code: "custom",
          message:
            "Weakness identifier namespaces must be lowercase names containing letters, numbers, dots, underscores, or hyphens.",
          path: [rawNamespace],
        });
        continue;
      }

      const values = (normalized[namespace] ??= new Set<string>());
      for (const [index, rawValue] of rawValues.entries()) {
        const value = rawValue.trim();
        if (value.length === 0) {
          context.addIssue({
            code: "custom",
            message: "Weakness identifiers must not be empty.",
            path: [rawNamespace, index],
          });
          continue;
        }
        values.add(normalizeKnownIdentifier(namespace, value));
      }
    }

    return Object.fromEntries(
      Object.keys(normalized)
        .sort()
        .flatMap((namespace) => {
          const values = sortStrings(normalized[namespace]);
          return values.length === 0 ? [] : [[namespace, values]];
        }),
    );
  },
);

export const weaknessSchema = z
  .strictObject({
    identifiers: weaknessIdentifiersSchema.optional(),
  })
  .transform(({ identifiers }) => ({
    identifiers: identifiers ?? {},
  }));

export const findingWeaknessSchema = weaknessSchema;
export const observationWeaknessSchema = weaknessSchema;
export const nonEmptyWeaknessSchema = weaknessSchema.refine(
  (weakness) => Object.keys(weakness.identifiers).length > 0,
  "Weakness mappings must contain at least one identifier.",
);

export function normalizeWeakness(input: unknown): Weakness {
  return weaknessSchema.parse(input);
}

export type Weakness = z.output<typeof weaknessSchema>;
export type WeaknessInput = z.input<typeof weaknessSchema>;
export type WeaknessIdentifiers = z.output<typeof weaknessIdentifiersSchema>;
export type WeaknessIdentifierNamespace = keyof WeaknessIdentifiers;
