import { weaknessSchema } from "@exposurenexus/backend/findings";

import type {
  AffectedResourceType,
  ObservationAffectedResource,
} from "@exposurenexus/contracts/model/affected-resource";

export type JsonObject = Record<string, unknown>;

/** Reports an unusable optional value by structural field label, never by source value. */
export type Diagnostics = (field: string) => void;

export type SourceLocation = NonNullable<
  Extract<ObservationAffectedResource, { type: AffectedResourceType.SourceCode }>["location"]
>;

/** A raw reported coordinate and the field label to report when it is unusable. */
export type SourceCoordinate = { value: unknown; field: string };

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isNonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function renderCodeBlock(content: string): string {
  // Source backticks must not close the surrounding Markdown fence.
  let length = 3;
  for (const [match] of content.matchAll(/`+/gu)) {
    length = Math.max(length, match.length + 1);
  }
  const fence = "`".repeat(length);
  return `${fence}\n${content}\n${fence}`;
}

export function renderEvidenceSection(label: string, content: string): string {
  // Details/summary sections render through the UI markdown sanitizer, and the
  // fenced block keeps the reported bytes, including trailing blank lines, as-is.
  // Labels may carry source text, which must not be read as summary HTML.
  const summary = label.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  return `<details><summary>${summary}</summary>\n\n${renderCodeBlock(content)}\n\n</details>`;
}

/**
 * Canonicalizes one optional CWE entry on its own, so that one unusable value is warned and
 * dropped instead of making the classifier discard the whole candidate.
 */
export function readCweIdentifier(
  value: unknown,
  field: string,
  warn: Diagnostics,
): string | undefined {
  const parsed = weaknessSchema.safeParse({ identifiers: { cwe: [value] } });
  const cwe = parsed.success ? parsed.data.identifiers.cwe?.[0] : undefined;
  if (cwe === undefined) {
    warn(field);
  }
  return cwe;
}

/** Reads an optional one-based line or column, warning when it is present but unusable. */
export function readCoordinate(
  { value, field }: SourceCoordinate,
  warn: Diagnostics,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    warn(field);
    return undefined;
  }
  return value;
}

/**
 * Maps reported coordinates to a source range without adjusting their convention. Unusable
 * components are warned and omitted, and a usable start survives an end that cannot form a range.
 */
export function readSourceLocation(
  coordinates: Record<keyof SourceLocation, SourceCoordinate>,
  warn: Diagnostics,
): SourceLocation | undefined {
  const startLine = readCoordinate(coordinates.startLine, warn);
  const startColumn = readCoordinate(coordinates.startColumn, warn);
  const endLine = readCoordinate(coordinates.endLine, warn);
  const endColumn = readCoordinate(coordinates.endColumn, warn);
  if (startLine === undefined) {
    return undefined;
  }

  const start: SourceLocation = {
    startLine,
    ...(startColumn === undefined ? {} : { startColumn }),
  };
  // Without its line, an end column would read as a range on the start line.
  if (endLine === undefined && coordinates.endLine.value !== undefined) {
    return start;
  }
  if (endLine !== undefined && endLine < startLine) {
    warn(coordinates.endLine.field);
    return start;
  }

  const location = { ...start, ...(endLine === undefined ? {} : { endLine }) };
  if (endColumn === undefined) {
    return location;
  }
  // A smaller end column is only reversed when the range ends on its start line.
  if (
    (endLine ?? startLine) === startLine &&
    startColumn !== undefined &&
    endColumn < startColumn
  ) {
    warn(coordinates.endColumn.field);
    return location;
  }
  return { ...location, endColumn };
}
