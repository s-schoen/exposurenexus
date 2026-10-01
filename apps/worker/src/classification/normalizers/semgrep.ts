import { weaknessSchema } from "@exposurenexus/backend/findings";
import { AffectedResourceType } from "@exposurenexus/contracts/model/affected-resource";
import { VulnerabilitySeverity } from "@exposurenexus/contracts/model/vulnerability";

import type { Normalizer, ObservationCandidate } from "../classifier.js";
import type { ObservationAffectedResource } from "@exposurenexus/contracts/model/affected-resource";
import type { Logger } from "pino";

type JsonObject = Record<string, unknown>;
type Diagnostics = (field: string) => void;
type SourceCodeResource = Extract<
  ObservationAffectedResource,
  { type: AffectedResourceType.SourceCode }
>;

const severities = new Map<string, VulnerabilitySeverity>([
  ["INFO", VulnerabilitySeverity.Low],
  ["LOW", VulnerabilitySeverity.Low],
  ["WARNING", VulnerabilitySeverity.Medium],
  ["MEDIUM", VulnerabilitySeverity.Medium],
  ["ERROR", VulnerabilitySeverity.High],
  ["HIGH", VulnerabilitySeverity.High],
  ["CRITICAL", VulnerabilitySeverity.Critical],
  ["EXPERIMENT", VulnerabilitySeverity.Info],
  ["INVENTORY", VulnerabilitySeverity.Info],
]);

/** One candidate per native Semgrep result, including partial scans and suppressed results. */
export class SemgrepJsonNormalizer implements Normalizer {
  public async normalize(bytes: Uint8Array, logger: Logger): Promise<ObservationCandidate[]> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder("utf-8").decode(bytes));
    } catch {
      throw new Error("semgrep: invalid JSON");
    }
    if (!isJsonObject(parsed)) {
      throw new Error("semgrep: document must be a JSON object");
    }
    if (!Array.isArray(parsed.results)) {
      throw new Error("semgrep: /results must be an array");
    }

    const document: JsonObject = {};
    for (const field of ["version", "engine_requested"]) {
      if (Object.hasOwn(parsed, field)) {
        document[field] = parsed[field];
      }
    }

    const candidates: ObservationCandidate[] = [];
    for (const [index, result] of parsed.results.entries()) {
      const sourceRecord = `/results/${index}`;
      if (!isJsonObject(result)) {
        throw new Error(`semgrep: ${sourceRecord} must be an object`);
      }
      const { check_id: ruleId, path, extra } = result;
      if (!isNonBlankString(ruleId)) {
        throw new Error(`semgrep: ${sourceRecord}/check_id must be a nonblank string`);
      }
      if (!isNonBlankString(path)) {
        throw new Error(`semgrep: ${sourceRecord}/path must be a nonblank string`);
      }
      if (!isJsonObject(extra)) {
        throw new Error(`semgrep: ${sourceRecord}/extra must be an object`);
      }

      const warn: Diagnostics = (field) => {
        logger.warn({ sourceRecord, field }, "semgrep: ignoring unusable optional value");
      };
      const description = isNonBlankString(extra.message) ? extra.message : null;
      if (extra.message !== undefined && description === null) {
        warn("extra.message");
      }
      const severity =
        typeof extra.severity === "string" ? severities.get(extra.severity) : undefined;
      if (severity === undefined) {
        warn("extra.severity");
      }
      const location = readLocation(result, warn);
      const snippet = readAvailableText(extra.lines, "extra.lines", warn);
      const fingerprint = readAvailableText(extra.fingerprint, "extra.fingerprint", warn);
      const fix = extra.fix;
      if (fix !== undefined && typeof fix !== "string") {
        warn("extra.fix");
      }

      candidates.push({
        source: "semgrep",
        sourceRecord,
        title: ruleId,
        description,
        severity: severity ?? VulnerabilitySeverity.Info,
        weakness: buildWeakness(ruleId, extra.metadata, warn),
        // Native Semgrep JSON supplies no authoritative scanned repository or revision.
        // Future ingestion context must supply them; paths and rule URLs cannot.
        affectedResource: {
          type: AffectedResourceType.SourceCode,
          file: path,
          ...(location === undefined ? {} : { location }),
          ...(fingerprint === undefined ? {} : { locationFingerprint: fingerprint }),
        },
        assetIdentifierCandidates: [],
        observedAt: null,
        evidence:
          snippet === undefined
            ? null
            : `<details><summary>Code Snippet</summary>\n\n${renderCodeBlock(snippet)}\n\n</details>`,
        remediation:
          typeof fix !== "string"
            ? null
            : fix === ""
              ? "Suggested fix: delete the matched source range."
              : `Suggested fix: replace the matched source range with:\n\n${renderCodeBlock(fix)}`,
        sourceMetadata: { provenance: { result, document } },
      });
    }

    summarizeDiagnostics(parsed.errors, logger);
    return candidates;
  }
}

function readAvailableText(value: unknown, field: string, warn: Diagnostics): string | undefined {
  if (value === undefined || value === "requires login") {
    return undefined;
  }
  if (!isNonBlankString(value)) {
    warn(field);
    return undefined;
  }
  return value;
}

function renderCodeBlock(content: string): string {
  // Source backticks must not close the surrounding Markdown fence.
  let length = 3;
  for (const [match] of content.matchAll(/`+/gu)) {
    length = Math.max(length, match.length + 1);
  }
  const fence = "`".repeat(length);
  return `${fence}\n${content}\n${fence}`;
}

function buildWeakness(
  ruleId: string,
  metadata: unknown,
  warn: Diagnostics,
): ObservationCandidate["weakness"] {
  const identifiers: Record<string, string[]> = { semgrep: [ruleId] };
  if (!isJsonObject(metadata)) {
    if (metadata !== undefined) {
      warn("extra.metadata");
    }
    return { identifiers };
  }

  const cwes = new Set<string>();
  const references = new Set<string>();
  for (const field of ["cwe", "references", "source", "shortlink", "source-rule-url"]) {
    const value = metadata[field];
    if (value === undefined) {
      continue;
    }

    for (const entry of Array.isArray(value) ? value : [value]) {
      if (!isNonBlankString(entry)) {
        warn(`extra.metadata.${field}`);
        continue;
      }
      if (field !== "cwe") {
        references.add(entry);
        continue;
      }

      // Descriptive labels must start with a CWE; prose and URLs are not classifications.
      const id = /^(CWE-\d+)\s*:/iu.exec(entry.trim())?.[1] ?? entry;
      const parsed = weaknessSchema.safeParse({ identifiers: { cwe: [id] } });
      if (!parsed.success) {
        warn("extra.metadata.cwe");
        continue;
      }
      for (const cwe of parsed.data.identifiers.cwe ?? []) {
        cwes.add(cwe);
      }
    }
  }

  if (cwes.size > 0) {
    identifiers.cwe = [...cwes].sort();
  }
  return {
    identifiers,
    ...(references.size > 0 ? { references: [...references] } : {}),
  };
}

function readLocation(result: JsonObject, warn: Diagnostics): SourceCodeResource["location"] {
  const start = readPosition(result.start, "start", warn);
  const end = readPosition(result.end, "end", warn);
  if (start.line === undefined) {
    return undefined;
  }

  const location: NonNullable<SourceCodeResource["location"]> = {
    startLine: start.line,
    ...(start.col === undefined ? {} : { startColumn: start.col }),
  };
  if (
    (end.line !== undefined && end.line < start.line) ||
    ((end.line === undefined || end.line === start.line) &&
      start.col !== undefined &&
      end.col !== undefined &&
      end.col < start.col)
  ) {
    warn("end");
    return location;
  }

  return {
    ...location,
    ...(end.line === undefined ? {} : { endLine: end.line }),
    ...(end.col === undefined ? {} : { endColumn: end.col }),
  };
}

function readPosition(
  value: unknown,
  field: string,
  warn: Diagnostics,
): { line?: number; col?: number } {
  if (value === undefined) {
    return {};
  }
  if (!isJsonObject(value)) {
    warn(field);
    return {};
  }

  const position: { line?: number; col?: number } = {};
  for (const key of ["line", "col"] as const) {
    const coordinate = value[key];
    if (coordinate === undefined) {
      continue;
    }
    if (typeof coordinate !== "number" || !Number.isInteger(coordinate) || coordinate <= 0) {
      warn(`${field}.${key}`);
      continue;
    }
    position[key] = coordinate;
  }
  return position;
}

function summarizeDiagnostics(value: unknown, logger: Logger): void {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value)) {
    logger.warn({ field: "errors" }, "semgrep: ignoring unusable optional value");
    return;
  }
  if (value.length === 0) {
    return;
  }

  const counts = { error: 0, warn: 0, info: 0, unknown: 0 };
  for (const diagnostic of value) {
    const level = isJsonObject(diagnostic) ? diagnostic.level : undefined;
    counts[level === "error" || level === "warn" || level === "info" ? level : "unknown"] += 1;
  }

  if (counts.error > 0 || counts.warn > 0 || counts.unknown > 0) {
    logger.warn(
      { field: "errors", counts },
      "semgrep: scanner diagnostics; coverage may be incomplete",
    );
  } else {
    logger.info({ field: "errors", counts }, "semgrep: scanner diagnostics");
  }
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
