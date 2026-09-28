import { z } from "zod/v4";

import { sarifFormats } from "./formats.js";

import type { JSONSchema } from "zod/v4/core";

type Schema = JSONSchema.JSONSchema & { definitions?: Record<string, Schema> };
type Path = (string | number)[];

/** Compatibility with the keywords used by the pinned Draft-04 SARIF schema. */
export function createSarifValidator(source: Schema) {
  const safeFields = new Set<string>();
  const converted = adaptSchema(source, safeFields);
  const validators = new Map<Schema, z.ZodType>();

  function validatorFor(node: Schema): z.ZodType {
    const existing = validators.get(node);
    if (existing !== undefined) {
      return existing;
    }

    const validator = z.fromJSONSchema(
      { ...node, definitions: converted.definitions },
      { defaultTarget: "draft-4", registry: z.registry() },
    );
    validators.set(node, validator);
    return validator;
  }

  function checkRawValues(
    value: unknown,
    node: Schema,
    path: Path,
    context: z.RefinementCtx,
  ): void {
    if (node.$ref !== undefined) {
      // All references in the pinned schema are local definition references.
      const name = node.$ref.slice("#/definitions/".length);
      const definition = converted.definitions?.[name];
      if (definition === undefined) {
        throw new Error("sarif: unsupported bundled schema reference");
      }
      checkRawValues(value, definition, path, context);
      return;
    }

    // Formats are checked on the raw input so dates and URLs are never repaired
    // or normalized. The format name is retained only as our own annotation.
    const format = node["sarif-format"];
    if (typeof format === "string" && typeof value === "string") {
      const validator = sarifFormats.get(format);
      if (validator === undefined || !validator.safeParse(value).success) {
        context.addIssue({ code: "custom", path, message: "Invalid SARIF format" });
      }
    }

    // multipleOf uses floating-point tolerance in Zod, while JSON Schema's
    // integer constraint requires an exact integer (without a safe-range cap).
    if (node["sarif-integer"] === true && !Number.isInteger(value)) {
      context.addIssue({ code: "custom", path, message: "Invalid SARIF integer" });
    }

    if (Array.isArray(value)) {
      if (typeof node.items === "object" && !Array.isArray(node.items)) {
        value.forEach((entry, index) =>
          checkRawValues(entry, node.items as Schema, [...path, index], context),
        );
      }
      return;
    }
    if (typeof value !== "object" || value === null) {
      return;
    }

    for (const [key, entry] of Object.entries(value)) {
      const declared = Object.hasOwn(node.properties ?? {}, key);
      const child = declared ? node.properties?.[key] : node.additionalProperties;
      const entryPath = [...path, key];

      // A permissive required-field alternative must not override the parent
      // object's additionalProperties: false during Zod intersection parsing.
      if (child === false) {
        context.addIssue({ code: "custom", path: entryPath, message: "Unexpected SARIF field" });
        continue;
      }

      // Zod deliberately skips __proto__ catchall values when constructing its
      // output. It is a legal JSON map key, so validate that value explicitly.
      if (key === "__proto__") {
        const invalid = typeof child === "object" && !validatorFor(child).safeParse(entry).success;
        if (invalid) {
          context.addIssue({ code: "custom", path: entryPath, message: "Invalid SARIF map entry" });
        }
      }

      if (typeof child === "object") {
        checkRawValues(entry, child, entryPath, context);
      }
    }
  }

  // Run extra checks before Zod copies the document and omits __proto__ keys.
  // Alternatives in this pinned schema contain only required-field checks;
  // Zod handles those after adaptation, including anyOf/oneOf cardinality.
  const validator = z
    .unknown()
    .superRefine((value, context) => {
      checkRawValues(value, converted, [], context);
    })
    .pipe(validatorFor(converted));

  return { validator, safeFields };
}

function adaptSchema(source: Schema, safeFields: Set<string>): Schema {
  const converted = { ...source };
  // Defaults are JSON Schema annotations, not permission to accept omissions.
  delete converted.default;

  if (source.format !== undefined) {
    if (!sarifFormats.has(source.format)) {
      throw new Error("sarif: unsupported bundled schema format");
    }
    delete converted.format;
    converted["sarif-format"] = source.format;
  }

  if (source.type === "integer") {
    // JSON Schema integers are not restricted to Number.MAX_SAFE_INTEGER.
    // Keep explicit numeric bounds and enforce exact integrality on raw input.
    converted.type = "number";
    converted["sarif-integer"] = true;
  }

  if (source.properties !== undefined) {
    converted.properties = Object.fromEntries(
      Object.entries(source.properties).map(([name, child]) => {
        safeFields.add(name);
        return [name, typeof child === "boolean" ? child : adaptSchema(child, safeFields)];
      }),
    );
  }

  if (source.definitions !== undefined) {
    converted.definitions = Object.fromEntries(
      Object.entries(source.definitions).map(([name, child]) => [
        name,
        adaptSchema(child, safeFields),
      ]),
    );
  }

  for (const key of ["items", "additionalProperties"] as const) {
    const child = source[key];
    if (typeof child === "object" && !Array.isArray(child)) {
      converted[key] = adaptSchema(child, safeFields);
    }
  }

  for (const key of ["anyOf", "oneOf", "allOf"] as const) {
    converted[key] = source[key]?.map((child) => adaptSchema(child, safeFields));
  }

  if (source.type === undefined && source.required !== undefined) {
    // The pinned schema uses required-only alternatives under object schemas.
    // Zod ignores these unless both the object type and property shapes exist.
    // Explicit JSON types exclude undefined, making presence mandatory without
    // imposing a new constraint on a present JSON value.
    converted.type = "object";
    converted.properties = Object.fromEntries(
      source.required.map((name) => [
        name,
        {
          type: ["string", "number", "boolean", "null", "array", "object"],
        },
      ]),
    );
  }

  return converted;
}
