import { AffectedResourceType } from "@exposurenexus/contracts/model/affected-resource";
import { VulnerabilitySeverity } from "@exposurenexus/contracts/model/vulnerability";

import {
  isJsonObject,
  isNonBlankString,
  readCoordinate,
  readCweIdentifier,
  readDateTime,
  readText,
  renderEvidenceSection,
} from "./shared.js";

import type { Normalizer, ObservationCandidate } from "../classifier.js";
import type { Diagnostics } from "./shared.js";
import type { Logger } from "pino";

const severities = new Map<string, VulnerabilitySeverity>([
  ["CRITICAL", VulnerabilitySeverity.Critical],
  ["HIGH", VulnerabilitySeverity.High],
  ["MEDIUM", VulnerabilitySeverity.Medium],
  ["LOW", VulnerabilitySeverity.Low],
  ["INFO", VulnerabilitySeverity.Info],
  ["TRACE", VulnerabilitySeverity.Info],
]);

/** Go's zero `time.Time`, which KICS serializes for a scan end it never recorded. */
const unsetInstant = Date.parse("0001-01-01T00:00:00Z");

/** One candidate per native KICS occurrence, without platform or version gates. */
export class KicsNormalizer implements Normalizer {
  public async normalize(bytes: Uint8Array, logger: Logger): Promise<ObservationCandidate[]> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    } catch {
      throw new Error("kics: invalid JSON or UTF-8");
    }
    if (!isJsonObject(parsed)) {
      throw new Error("kics: document must be a JSON object");
    }
    if (!Array.isArray(parsed.queries)) {
      throw new Error("kics: /queries must be an array");
    }

    const warnDocument: Diagnostics = (field) => {
      logger.warn({ field }, "kics: ignoring unusable optional value");
    };
    for (const field of [
      "files_failed_to_scan",
      "queries_failed_to_execute",
      "queries_failed_to_compute_similarity_id",
    ]) {
      const count = readCount(parsed[field], field, warnDocument);
      if (count !== undefined && count > 0) {
        logger.warn({ field, count }, "kics: scan reported failures");
      }
    }

    const summaryCount = readCount(parsed.total_bom_resources, "total_bom_resources", warnDocument);
    let inventoryCount: number | undefined;
    if (parsed.bill_of_materials !== undefined) {
      if (
        Array.isArray(parsed.bill_of_materials) &&
        parsed.bill_of_materials.every((group) => isJsonObject(group) && Array.isArray(group.files))
      ) {
        // Count occurrences, not query groups; skipped inventory needs no detection identity.
        inventoryCount = parsed.bill_of_materials.reduce(
          (count, group) => count + group.files.length,
          0,
        );
      } else {
        warnDocument("bill_of_materials");
      }
    }
    const skippedCount = inventoryCount ?? summaryCount;
    if (skippedCount !== undefined && skippedCount > 0) {
      logger.warn(
        { field: "bill_of_materials", count: skippedCount },
        "kics: skipping inventory occurrences",
      );
    }

    const document = Object.fromEntries(
      Object.entries(parsed).filter(([key]) => key !== "queries" && key !== "bill_of_materials"),
    );
    let observedAt: Date | null = null;
    if (parsed.end !== undefined) {
      const instant = readDateTime(parsed.end);
      if (instant !== null && instant.getTime() !== unsetInstant) {
        observedAt = instant;
      } else {
        warnDocument("end");
      }
    }

    const candidates: ObservationCandidate[] = [];
    for (const [queryIndex, query] of parsed.queries.entries()) {
      const queryLocator = `/queries/${queryIndex}`;
      if (!isJsonObject(query)) {
        throw new Error(`kics: ${queryLocator} must be an object`);
      }
      if (!isNonBlankString(query.query_id)) {
        throw new Error(`kics: ${queryLocator}/query_id must be a nonblank string`);
      }
      if (!Array.isArray(query.files)) {
        throw new Error(`kics: ${queryLocator}/files must be an array`);
      }
      const warnQuery: Diagnostics = (field) => {
        logger.warn(
          { sourceRecord: queryLocator, field },
          "kics: ignoring unusable optional value",
        );
      };
      const title = readText(query.query_name, "query_name", warnQuery) ?? query.query_id;
      const description = readText(query.description, "description", warnQuery);
      const reference = readText(query.query_url, "query_url", warnQuery);
      const cweText = readText(query.cwe, "cwe", warnQuery);
      const cwe = cweText === null ? undefined : readCweIdentifier(cweText, "cwe", warnQuery);
      const severity =
        typeof query.severity === "string" ? severities.get(query.severity) : undefined;
      if (severity === undefined && query.severity !== undefined && query.severity !== null) {
        warnQuery("severity");
      }
      const queryContext = Object.fromEntries(
        Object.entries(query).filter(([key]) => key !== "files"),
      );

      for (const [index, result] of query.files.entries()) {
        const sourceRecord = `${queryLocator}/files/${index}`;
        if (!isJsonObject(result)) {
          throw new Error(`kics: ${sourceRecord} must be an object`);
        }
        if (!isNonBlankString(result.file_name)) {
          throw new Error(`kics: ${sourceRecord}/file_name must be a nonblank string`);
        }
        const warn: Diagnostics = (field) => {
          logger.warn({ sourceRecord, field }, "kics: ignoring unusable optional value");
        };
        const line = readCoordinate({ value: result.line, field: "line" }, warn);
        const symbol = readText(result.resource_name, "resource_name", warn);
        const expected = readText(result.expected_value, "expected_value", warn);
        const actual = readText(result.actual_value, "actual_value", warn);
        const remediation = readText(result.remediation, "remediation", warn);
        const remediationType = readText(result.remediation_type, "remediation_type", warn);
        const evidence = [
          ...(expected === null ? [] : [renderEvidenceSection("Expected", expected)]),
          ...(actual === null ? [] : [renderEvidenceSection("Actual", actual)]),
        ];
        candidates.push({
          source: "kics",
          sourceRecord,
          title,
          description,
          severity: severity ?? VulnerabilitySeverity.Info,
          weakness: {
            identifiers: { kics: [query.query_id], ...(cwe === undefined ? {} : { cwe: [cwe] }) },
            ...(reference === null ? {} : { references: [reference] }),
          },
          // Repository/revision must come from future ingestion context, not scanner paths,
          // resource names, or similarity IDs. None establishes canonical asset identity.
          affectedResource: {
            type: AffectedResourceType.SourceCode,
            file: result.file_name,
            ...(line === undefined ? {} : { location: { startLine: line } }),
            ...(symbol === null ? {} : { symbol }),
          },
          assetIdentifierCandidates: [],
          observedAt: observedAt === null ? null : new Date(observedAt),
          evidence: evidence.length === 0 ? null : evidence.join("\n\n"),
          remediation:
            remediation === null
              ? null
              : renderEvidenceSection(
                  remediationType === null
                    ? "Suggested remediation"
                    : `Suggested remediation (${remediationType})`,
                  remediation,
                ),
          fingerprints: {},
          sourceMetadata: {
            provenance: {
              result,
              query: structuredClone(queryContext),
              document: structuredClone(document),
            },
          },
        });
      }
    }
    return candidates;
  }
}

function readCount(value: unknown, field: string, warn: Diagnostics): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return value;
  warn(field);
  return undefined;
}
