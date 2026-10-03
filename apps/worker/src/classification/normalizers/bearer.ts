import { AffectedResourceType } from "@exposurenexus/contracts/model/affected-resource";
import { VulnerabilitySeverity } from "@exposurenexus/contracts/model/vulnerability";
import { fromMarkdown } from "mdast-util-from-markdown";

import {
  isJsonObject,
  isNonBlankString,
  readCoordinate,
  readCweIdentifier,
  readSourceLocation,
  readText,
  renderEvidenceSection,
} from "./shared.js";

import type { Normalizer, ObservationCandidate } from "../classifier.js";
import type { Diagnostics, JsonObject, SourceLocation } from "./shared.js";
import type { Logger } from "pino";

type ReportContext = {
  document: JsonObject;
  logger: Logger;
  /** Descriptions repeat per rule, so each distinct one is parsed once per report. */
  remediations: Map<string, string | null>;
};

const severities = new Map<string, VulnerabilitySeverity>([
  ["critical", VulnerabilitySeverity.Critical],
  ["high", VulnerabilitySeverity.High],
  ["medium", VulnerabilitySeverity.Medium],
  ["low", VulnerabilitySeverity.Low],
  ["warning", VulnerabilitySeverity.Info],
]);

// Local supported-input contract, not an official JSON Schema. Upstream definitions:
// https://github.com/Bearer/bearer/blob/v2.1.1/pkg/report/output/security/types/types.go
// https://github.com/Bearer/bearer/blob/v2.1.1/pkg/report/output/security/formatter.go
export class BearerJsonNormalizer implements Normalizer {
  public async normalize(bytes: Uint8Array, logger: Logger): Promise<ObservationCandidate[]> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    } catch {
      throw new Error("bearer: invalid JSON or UTF-8");
    }
    if (!isJsonObject(parsed)) {
      throw new Error("bearer: document must be a JSON object");
    }
    if (Object.hasOwn(parsed, "source")) {
      return readJsonV2(parsed, logger);
    }

    const report: ReportContext = { document: {}, logger, remediations: new Map() };
    const candidates: ObservationCandidate[] = [];
    for (const [bucket, findings] of Object.entries(parsed)) {
      if (!severities.has(bucket)) {
        throw new Error("bearer: document contains an unknown severity bucket");
      }
      if (!Array.isArray(findings)) {
        throw new Error(`bearer: /${bucket} must be an array`);
      }
      for (const [index, finding] of findings.entries()) {
        candidates.push(mapFinding(finding, `/${bucket}/${index}`, report, bucket));
      }
    }
    return candidates;
  }
}

function readJsonV2(report: JsonObject, logger: Logger): ObservationCandidate[] {
  if (report.source !== "Bearer") {
    throw new Error("bearer: /source must be Bearer");
  }
  if (!Array.isArray(report.findings) && report.findings !== null) {
    throw new Error("bearer: /findings must be an array or null");
  }
  const document = Object.fromEntries(
    Object.entries(report).filter(
      ([key]) => key !== "findings" && key !== "errors" && key !== "expected_findings",
    ),
  );
  const context: ReportContext = { document, logger, remediations: new Map() };
  const candidates = (report.findings ?? []).map((finding, index) =>
    mapFinding(finding, `/findings/${index}`, context),
  );

  if (report.errors !== undefined && report.errors !== null) {
    if (!Array.isArray(report.errors)) {
      logger.warn({ field: "errors" }, "bearer: ignoring unusable optional value");
    } else if (report.errors.length > 0) {
      logger.warn(
        { field: "errors", count: report.errors.length },
        "bearer: scanner errors; coverage may be incomplete",
      );
    }
  }
  return candidates;
}

function mapFinding(
  result: unknown,
  sourceRecord: string,
  { document, logger, remediations }: ReportContext,
  groupedSeverity?: string,
): ObservationCandidate {
  if (!isJsonObject(result)) {
    throw new Error(`bearer: ${sourceRecord} must be an object`);
  }
  const { id, filename } = result;
  if (!isNonBlankString(id)) {
    throw new Error(`bearer: ${sourceRecord}/id must be a nonblank string`);
  }
  if (!isNonBlankString(filename)) {
    throw new Error(`bearer: ${sourceRecord}/filename must be a nonblank string`);
  }

  const warn: Diagnostics = (field) => {
    logger.warn({ sourceRecord, field }, "bearer: ignoring unusable optional value");
  };
  const sourceSeverity = groupedSeverity ?? result.severity;
  const severity = typeof sourceSeverity === "string" ? severities.get(sourceSeverity) : undefined;
  if (severity === undefined) {
    warn("severity");
  }
  const title = readText(result.title, "title", warn) ?? id;
  const description = readText(result.description, "description", warn);
  const location = readLocation(result, warn);
  const codeExtract = readText(result.code_extract, "code_extract", warn);

  return {
    source: "bearer",
    sourceRecord,
    title,
    description,
    remediation: description === null ? null : readRemediation(description, remediations),
    evidence: codeExtract === null ? null : renderEvidenceSection("Code Extract", codeExtract),
    severity: severity ?? VulnerabilitySeverity.Info,
    weakness: buildWeakness(id, result, warn),
    // Native output has no authoritative repository or revision; future ingestion context must
    // supply them. Occurrence-order fingerprints are provenance, not stable location identity.
    affectedResource: {
      type: AffectedResourceType.SourceCode,
      file: filename,
      ...(location === undefined ? {} : { location }),
    },
    assetIdentifierCandidates: [],
    observedAt: null,
    sourceMetadata: {
      provenance: {
        result,
        ...(sourceSeverity === undefined ? {} : { severity: sourceSeverity }),
        // Each candidate owns its provenance, so later edits cannot leak across the report.
        document: structuredClone(document),
      },
    },
  };
}

function readRemediation(
  description: string,
  remediations: ReportContext["remediations"],
): string | null {
  let remediation = remediations.get(description);
  if (remediation === undefined) {
    remediation = extractRemediation(description);
    remediations.set(description, remediation);
  }
  return remediation;
}

function extractRemediation(description: string): string | null {
  // Slice the original text using Markdown boundaries, rather than re-rendering its contents.
  let start: number | undefined;
  let end = description.length;
  for (const node of fromMarkdown(description).children) {
    if (node.type !== "heading") {
      continue;
    }
    if (start !== undefined && node.depth <= 2) {
      end = node.position?.start.offset ?? end;
      break;
    }
    if (
      node.depth === 2 &&
      node.children.length === 1 &&
      node.children[0].type === "text" &&
      node.children[0].value === "Remediations"
    ) {
      start = node.position?.end.offset;
    }
  }
  if (start === undefined) {
    return null;
  }
  const section = trimBlankLines(description.slice(start, end));
  return isNonBlankString(section) ? section : null;
}

function trimBlankLines(text: string): string {
  // Work line by line: anchored regexes backtrack over long runs of blank lines.
  // Even indexes hold line contents and odd indexes hold their line terminators.
  const parts = text.split(/(\r\n|\r|\n)/u);
  let first = 0;
  while (first < parts.length - 1 && isBlankLine(parts[first])) {
    first += 2;
  }
  let last = parts.length - 1;
  while (last > first && isBlankLine(parts[last])) {
    last -= 2;
  }
  return parts.slice(first, last + 1).join("");
}

function isBlankLine(line: string): boolean {
  return /^[ \t]*$/u.test(line);
}

function buildWeakness(
  id: string,
  result: JsonObject,
  warn: Diagnostics,
): ObservationCandidate["weakness"] {
  const identifiers: Record<string, string[]> = { bearer: [id] };
  const cwes = new Set<string>();
  const values = result.cwe_ids;
  if (values !== undefined && values !== null) {
    if (!Array.isArray(values)) {
      warn("cwe_ids");
    } else {
      for (const value of values) {
        const cwe = readCweIdentifier(value, "cwe_ids", warn);
        if (cwe !== undefined) {
          cwes.add(cwe);
        }
      }
    }
  }
  if (cwes.size > 0) {
    identifiers.cwe = [...cwes];
  }
  const reference = readText(result.documentation_url, "documentation_url", warn);
  return { identifiers, ...(reference === null ? {} : { references: [reference] }) };
}

function readLocation(result: JsonObject, warn: Diagnostics): SourceLocation | undefined {
  const sink = isJsonObject(result.sink) ? result.sink : {};
  if (result.sink !== undefined && !isJsonObject(result.sink)) {
    warn("sink");
  }
  const column = isJsonObject(sink.column) ? sink.column : {};
  if (sink.column !== undefined && !isJsonObject(sink.column)) {
    warn("sink.column");
  }
  const location = readSourceLocation(
    {
      startLine: { value: sink.start, field: "sink.start" },
      startColumn: { value: column.start, field: "sink.column.start" },
      endLine: { value: sink.end, field: "sink.end" },
      endColumn: { value: column.end, field: "sink.column.end" },
    },
    warn,
  );
  if (location !== undefined) {
    return location;
  }

  const fallback = readCoordinate({ value: result.line_number, field: "line_number" }, warn);
  return fallback === undefined ? undefined : { startLine: fallback };
}
