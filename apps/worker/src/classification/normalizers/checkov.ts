import { AffectedResourceType } from "@exposurenexus/contracts/model/affected-resource";
import { VulnerabilitySeverity } from "@exposurenexus/contracts/model/vulnerability";

import {
  isJsonObject,
  isNonBlankString,
  readCweIdentifier,
  readSourceLocation,
  readText,
  renderCodeBlock,
  renderEvidenceSection,
} from "./shared.js";

import type { Normalizer, ObservationCandidate } from "../classifier.js";
import type { Diagnostics, JsonObject, SourceLocation } from "./shared.js";
import type { Logger } from "pino";

const supportedCheckTypes = new Set([
  "ansible",
  "argo_workflows",
  "arm",
  "azure_pipelines",
  "bicep",
  "bitbucket_configuration",
  "bitbucket_pipelines",
  "circleci_pipelines",
  "cloudformation",
  "dockerfile",
  "github_actions",
  "github_configuration",
  "gitlab_ci",
  "gitlab_configuration",
  "helm",
  "json",
  "kubernetes",
  "kustomize",
  "openapi",
  "secrets",
  "serverless",
  "terraform",
  "terraform_json",
  "terraform_plan",
  "yaml",
]);

// Prisma Cloud SAST reports, and the CDK reports split from them, are named per language.
// Their records share the native shape but need a dedicated file and CWE mapping.
const sastCheckTypes = new Set([
  "cdk_python",
  "cdk_typescript",
  "sast_golang",
  "sast_java",
  "sast_javascript",
  "sast_python",
  "sast_typescript",
]);

const severities = new Map<string, VulnerabilitySeverity>([
  ["CRITICAL", VulnerabilitySeverity.Critical],
  ["HIGH", VulnerabilitySeverity.High],
  ["IMPORTANT", VulnerabilitySeverity.High],
  ["MEDIUM", VulnerabilitySeverity.Medium],
  ["MODERATE", VulnerabilitySeverity.Medium],
  ["LOW", VulnerabilitySeverity.Low],
  ["INFO", VulnerabilitySeverity.Info],
  ["NONE", VulnerabilitySeverity.Info],
  ["OFF", VulnerabilitySeverity.Info],
]);

// Local native-JSON contract, not a scanner-version gate. Producer definitions:
// https://github.com/bridgecrewio/checkov/blob/3.2.360/checkov/common/output/record.py
export class CheckovNormalizer implements Normalizer {
  public async normalize(bytes: Uint8Array, logger: Logger): Promise<ObservationCandidate[]> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    } catch {
      throw new Error("checkov: invalid JSON or UTF-8");
    }
    if (
      isJsonObject(parsed) &&
      !Object.hasOwn(parsed, "check_type") &&
      !Object.hasOwn(parsed, "results") &&
      isNonBlankString(parsed.checkov_version) &&
      ["passed", "failed", "skipped", "parsing_errors", "resource_count"].every(
        (field) => parsed[field] === 0,
      )
    ) {
      return [];
    }
    const reports = Array.isArray(parsed) ? parsed : [parsed];
    if (reports.length === 0) {
      throw new Error("checkov: report array must not be empty");
    }
    const candidates: ObservationCandidate[] = [];
    let supported = false;
    for (const [reportIndex, report] of reports.entries()) {
      const sourceRecord = Array.isArray(parsed) ? `/${reportIndex}` : "";
      if (!isJsonObject(report)) {
        throw new Error(`checkov: ${sourceRecord || "document"} must be an object`);
      }
      if (!isNonBlankString(report.check_type)) {
        throw new Error(`checkov: ${sourceRecord}/check_type must be a nonblank string`);
      }
      const checkType = report.check_type;
      if (!supportedCheckTypes.has(checkType) && !sastCheckTypes.has(checkType)) {
        logger.warn({ sourceRecord, count: 1 }, "checkov: skipping unsupported report");
        continue;
      }
      supported = true;
      if (!isJsonObject(report.results)) {
        throw new Error(`checkov: ${sourceRecord}/results must be an object`);
      }
      if (!Array.isArray(report.results.failed_checks)) {
        throw new Error(`checkov: ${sourceRecord}/results/failed_checks must be an array`);
      }
      const warn: Diagnostics = (field) => {
        logger.warn({ sourceRecord, field }, "checkov: ignoring unusable optional value");
      };
      const errors = report.results.parsing_errors;
      if (errors !== undefined && errors !== null && !Array.isArray(errors)) {
        warn("results/parsing_errors");
      }
      const summary = report.summary;
      if (summary !== undefined && summary !== null && !isJsonObject(summary)) {
        warn("summary");
      }
      const summaryCount = isJsonObject(summary) ? summary.parsing_errors : undefined;
      const usableCount =
        typeof summaryCount === "number" && Number.isSafeInteger(summaryCount) && summaryCount >= 0;
      if (summaryCount !== undefined && summaryCount !== null && !usableCount) {
        warn("summary/parsing_errors");
      }
      const count = Array.isArray(errors) ? errors.length : usableCount ? summaryCount : 0;
      if (count > 0) {
        logger.warn({ sourceRecord, count }, "checkov: scanner reported parsing errors");
      }
      const document = Object.fromEntries(
        Object.entries(report).filter(([key]) => key !== "results"),
      );
      for (const [index, result] of report.results.failed_checks.entries()) {
        candidates.push(
          mapFinding(
            result,
            `${sourceRecord}/results/failed_checks/${index}`,
            checkType,
            document,
            logger,
          ),
        );
      }
    }
    if (!supported) {
      throw new Error("checkov: input contains no supported reports");
    }
    return candidates;
  }
}

function mapFinding(
  result: unknown,
  sourceRecord: string,
  checkType: string,
  document: JsonObject,
  logger: Logger,
): ObservationCandidate {
  if (!isJsonObject(result)) {
    throw new Error(`checkov: ${sourceRecord} must be an object`);
  }
  const { check_id, file_path } = result;
  if (!isNonBlankString(check_id)) {
    throw new Error(`checkov: ${sourceRecord}/check_id must be a nonblank string`);
  }
  if (!isNonBlankString(file_path)) {
    throw new Error(`checkov: ${sourceRecord}/file_path must be a nonblank string`);
  }
  if (!isJsonObject(result.check_result) || result.check_result.result !== "FAILED") {
    throw new Error(`checkov: ${sourceRecord}/check_result/result must be FAILED`);
  }
  const warn: Diagnostics = (field) => {
    logger.warn({ sourceRecord, field }, "checkov: ignoring unusable optional value");
  };
  const title = readText(result.check_name, "check_name", warn) ?? check_id;
  const description = readText(result.description, "description", warn);
  const shortDescription = readText(result.short_description, "short_description", warn);
  const alias = readText(result.bc_check_id, "bc_check_id", warn);
  const reference = readText(result.guideline, "guideline", warn);
  const symbol = checkType === "secrets" ? null : readText(result.resource, "resource", warn);
  const sast = sastCheckTypes.has(checkType);
  // SAST file_path is only the file name; repo_file_path keeps its directories relative to
  // Checkov's working directory, in the same leading-slash style as other frameworks' file_path.
  const file = (sast ? readText(result.repo_file_path, "repo_file_path", warn) : null) ?? file_path;
  const cwes = sast ? readCwes(result.cwe, warn) : [];
  const fix = readText(result.fixed_definition, "fixed_definition", warn);
  const location = readLocation(result.file_line_range, warn);
  const evidence = readEvidence(result.code_block, warn);
  const severity =
    typeof result.severity === "string" ? severities.get(result.severity) : undefined;
  if (severity === undefined && result.severity !== undefined && result.severity !== null) {
    warn("severity");
  }
  return {
    source: "checkov",
    sourceRecord,
    title,
    description: description ?? shortDescription,
    remediation: fix === null ? null : `Suggested definition:\n\n${renderCodeBlock(fix)}`,
    evidence,
    severity: severity ?? VulnerabilitySeverity.Info,
    weakness: {
      identifiers: {
        checkov: [check_id],
        ...(alias === null ? {} : { bridgecrew: [alias] }),
        ...(cwes.length === 0 ? {} : { cwe: cwes }),
      },
      ...(reference === null ? {} : { references: [reference] }),
    },
    // Authoritative repository/revision context belongs to future ingestion context,
    // not scanner paths, resource names, or tags.
    affectedResource: {
      type: AffectedResourceType.SourceCode,
      file,
      ...(location === undefined ? {} : { location }),
      ...(symbol === null ? {} : { symbol }),
    },
    assetIdentifierCandidates: [],
    observedAt: null,
    sourceMetadata: { provenance: { result, document: structuredClone(document) } },
  };
}

function readCwes(value: unknown, warn: Diagnostics): string[] {
  if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) {
    return [];
  }
  const cwes = new Set<string>();
  for (const entry of Array.isArray(value) ? value : [value]) {
    if (!isNonBlankString(entry)) {
      warn("cwe");
      continue;
    }
    // Policy labels such as "CWE-89: Improper Neutralization ..." start with their CWE.
    const id = /^(CWE-\d+)\s*:/iu.exec(entry.trim())?.[1] ?? entry;
    const cwe = readCweIdentifier(id, "cwe", warn);
    if (cwe !== undefined) {
      cwes.add(cwe);
    }
  }
  return [...cwes];
}

function readLocation(value: unknown, warn: Diagnostics): SourceLocation | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    warn("file_line_range");
    return undefined;
  }
  if (value.length === 0 || value.length > 2) {
    warn("file_line_range");
  }
  return readSourceLocation(
    {
      startLine: { value: value[0], field: "file_line_range/0" },
      endLine: { value: value[1], field: "file_line_range/1" },
      startColumn: { value: undefined, field: "file_line_range" },
      endColumn: { value: undefined, field: "file_line_range" },
    },
    warn,
  );
}

function readEvidence(value: unknown, warn: Diagnostics): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (!Array.isArray(value)) {
    warn("code_block");
    return null;
  }
  const lines: string[] = [];
  for (const tuple of value) {
    if (
      !Array.isArray(tuple) ||
      tuple.length !== 2 ||
      !Number.isInteger(tuple[0]) ||
      typeof tuple[1] !== "string"
    ) {
      warn("code_block");
      return null;
    }
    lines.push(tuple[1]);
  }
  const text = lines.join("");
  return text.length === 0 ? null : renderEvidenceSection("Code", text);
}
