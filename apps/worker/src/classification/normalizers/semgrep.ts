import { AffectedResourceType } from "@exposurenexus/contracts/model/affected-resource";
import { VulnerabilitySeverity } from "@exposurenexus/contracts/model/vulnerability";

import {
  isJsonObject,
  isNonBlankString,
  readCweIdentifier,
  readSourceLocation,
  renderCodeBlock,
  renderEvidenceSection,
} from "./shared.js";

import type { Normalizer, ObservationCandidate } from "../classifier.js";
import type { Diagnostics, JsonObject, SourceLocation } from "./shared.js";
import type { Logger } from "pino";

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
      parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    } catch {
      throw new Error("semgrep: invalid JSON or UTF-8");
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
      // Blank messages are unavailable rather than malformed.
      const description = isNonBlankString(extra.message) ? extra.message : null;
      if (extra.message !== undefined && typeof extra.message !== "string") {
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
        // Unlike Bearer's rule/file ordinal, the fingerprint hashes the rule, path, and matched
        // code; its ordinal only separates otherwise identical matches, so it is location identity.
        affectedResource: {
          type: AffectedResourceType.SourceCode,
          file: path,
          ...(location === undefined ? {} : { location }),
          ...(fingerprint === undefined ? {} : { locationFingerprint: fingerprint }),
        },
        assetIdentifierCandidates: [],
        fingerprints: fingerprint === undefined ? {} : { semgrep: [fingerprint] },
        observedAt: null,
        evidence: snippet === undefined ? null : renderEvidenceSection("Code Snippet", snippet),
        remediation:
          typeof fix !== "string"
            ? null
            : fix === ""
              ? "Suggested fix: delete the matched source range."
              : `Suggested fix: replace the matched source range with:\n\n${renderCodeBlock(fix)}`,
        // Each candidate owns its provenance, so later edits cannot leak across the report.
        sourceMetadata: { provenance: { result, document: structuredClone(document) } },
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
      const cwe = readCweIdentifier(id, "extra.metadata.cwe", warn);
      if (cwe !== undefined) {
        cwes.add(cwe);
      }
    }
  }

  if (cwes.size > 0) {
    identifiers.cwe = [...cwes];
  }
  return {
    identifiers,
    ...(references.size > 0 ? { references: [...references] } : {}),
  };
}

function readLocation(result: JsonObject, warn: Diagnostics): SourceLocation | undefined {
  const start = readPosition(result.start, "start", warn);
  const end = readPosition(result.end, "end", warn);
  return readSourceLocation(
    {
      startLine: { value: start.line, field: "start.line" },
      startColumn: { value: start.col, field: "start.col" },
      endLine: { value: end.line, field: "end.line" },
      endColumn: { value: end.col, field: "end.col" },
    },
    warn,
  );
}

function readPosition(value: unknown, field: string, warn: Diagnostics): JsonObject {
  if (value !== undefined && !isJsonObject(value)) {
    warn(field);
  }
  return isJsonObject(value) ? value : {};
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
