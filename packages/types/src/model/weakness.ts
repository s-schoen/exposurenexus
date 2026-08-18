import { z } from "zod/v4";

import {
  canonicalizeKnownSecurityIdentifier,
  type KnownSecurityIdentifierNamespace,
} from "./security-identifier.js";

const namespacePattern = /^[a-z][a-z\d._-]*$/u;
const knownNamespaces = new Set<KnownSecurityIdentifierNamespace>(["cve", "cwe", "ghsa"]);

function sortStrings(values: Iterable<string>): string[] {
  return [...values].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}

function normalizeNamespace(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  return namespacePattern.test(normalized) ? normalized : null;
}

function isKnownNamespace(value: string): value is KnownSecurityIdentifierNamespace {
  return knownNamespaces.has(value as KnownSecurityIdentifierNamespace);
}

const rawWeaknessIdentifiersSchema = z
  .unknown()
  .superRefine((value, context) => {
    if (
      typeof value === "object" &&
      value !== null &&
      Object.prototype.hasOwnProperty.call(value, "__proto__")
    ) {
      context.addIssue({
        code: "custom",
        message: "Weakness identifier namespaces must use ordinary property names.",
        path: ["__proto__"],
      });
    }
  })
  .pipe(z.record(z.string(), z.array(z.string())));

export const weaknessIdentifiersSchema = rawWeaknessIdentifiersSchema.transform(
  (identifiers, context) => {
    const normalized = new Map<string, Set<string>>();

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

      const values = normalized.get(namespace) ?? new Set<string>();
      normalized.set(namespace, values);
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
        try {
          values.add(
            isKnownNamespace(namespace)
              ? canonicalizeKnownSecurityIdentifier(namespace, value)
              : value,
          );
        } catch (error) {
          context.addIssue({
            code: "custom",
            message: error instanceof Error ? error.message : "Invalid weakness identifier.",
            path: [rawNamespace, index],
          });
        }
      }
    }

    return Object.fromEntries(
      [...normalized.entries()]
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .flatMap(([namespace, identifiers]) => {
          const values = sortStrings(identifiers);
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
