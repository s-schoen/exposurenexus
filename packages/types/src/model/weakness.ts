import { z } from "zod/v4";

import { canonicalizeKnownSecurityIdentifier } from "./security-identifier.js";

const namespacePattern = /^[a-z][a-z\d._-]*$/u;
const namespaceSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    namespacePattern,
    "Weakness identifier namespaces must contain letters, numbers, dots, underscores, or hyphens.",
  );
const identifierSchema = z.string().trim().min(1, "Weakness identifiers must not be empty.");

function canonicalizeIdentifier(namespace: string, identifier: string): string {
  switch (namespace) {
    case "cve":
    case "cwe":
    case "ghsa":
      return canonicalizeKnownSecurityIdentifier(namespace, identifier);
    default:
      return identifier;
  }
}

const weaknessIdentifiersSchema = z
  .record(namespaceSchema, z.array(identifierSchema))
  .transform((identifiers, context) => {
    const result: Record<string, string[]> = {};

    for (const namespace of Object.keys(identifiers).sort()) {
      const identifiersForNamespace = identifiers[namespace];
      if (identifiersForNamespace === undefined) {
        continue;
      }

      const values = new Set<string>();
      for (const [index, identifier] of identifiersForNamespace.entries()) {
        try {
          values.add(canonicalizeIdentifier(namespace, identifier));
        } catch (error) {
          context.addIssue({
            code: "custom",
            message: error instanceof Error ? error.message : "Invalid weakness identifier.",
            path: [namespace, index],
          });
        }
      }

      if (values.size > 0) {
        result[namespace] = [...values].sort();
      }
    }

    return result;
  });

export const weaknessSchema = z.strictObject({
  identifiers: weaknessIdentifiersSchema.default({}),
});

export const nonEmptyWeaknessSchema = weaknessSchema.refine(
  (weakness) => Object.keys(weakness.identifiers).length > 0,
  "Weakness mappings must contain at least one identifier.",
);

export type Weakness = z.output<typeof weaknessSchema>;
