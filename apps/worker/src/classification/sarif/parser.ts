// OASIS SARIF 2.1.0 Errata 01, formatted locally without changing schema values.
// Source: https://docs.oasis-open.org/sarif/sarif/v2.1.0/errata01/os/schemas/sarif-schema-2.1.0.json
// Upstream SHA-256: c3b4bb2d6093897483348925aaa73af03b3e3f4bd4ca38cef26dcb4212a2682e
import schema from "./sarif-schema-2.1.0.json" with { type: "json" };
import { createSarifValidator } from "./validation.js";

import type { Log } from "sarif";
import type { JSONSchema } from "zod/v4/core";

/** Property bags are source-specific, not validated SARIF structures. */
type SafeProperties<T> = T extends (infer Item)[]
  ? SafeProperties<Item>[]
  : T extends object
    ? {
        [Key in keyof T]: Key extends "properties"
          ? Record<string, unknown>
          : SafeProperties<T[Key]>;
      }
    : T;

export type SarifDocument = Omit<SafeProperties<Log>, "runs"> & {
  runs: SafeProperties<Log["runs"]> | null;
};
export type SarifRun = NonNullable<SarifDocument["runs"]>[number];
export type SarifResult = NonNullable<SarifRun["results"]>[number];
export type SarifRule = NonNullable<SarifRun["tool"]["driver"]["rules"]>[number];

const { validator, safeFields } = createSarifValidator(schema as JSONSchema.JSONSchema);

/** Validates the entire file without repairing or resolving any source values. */
export function parseSarif(bytes: Uint8Array): SarifDocument {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new Error("sarif: invalid JSON or UTF-8 input");
  }
  const validated = validator.safeParse(value);
  if (!validated.success) {
    // Map keys and Zod messages can contain source values. Expose only known
    // schema field names and array indices, never arbitrary keys or messages.
    const path = validated.error.issues[0]?.path
      .map((part) =>
        typeof part === "number" || (typeof part === "string" && safeFields.has(part))
          ? part
          : "<key>",
      )
      .join("/");
    throw new Error(`sarif: schema validation failed at /${path ?? ""}`);
  }
  // Return the original JSON, not Zod's parsed copy: raw provenance is verbatim.
  return value as SarifDocument;
}
