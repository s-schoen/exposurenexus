import { assetIdentifierSchema } from "@exposurenexus/backend/assets";
import { weaknessSchema } from "@exposurenexus/backend/findings";
import {
  AffectedResourceType,
  WebEndpointComponentKind,
} from "@exposurenexus/contracts/model/affected-resource";
import { AssetIdentifierType } from "@exposurenexus/contracts/model/asset-identifier";
import { VulnerabilitySeverity } from "@exposurenexus/contracts/model/vulnerability";

import { uriSchema } from "../sarif/formats.js";
import { parseSarif } from "../sarif/parser.js";
import {
  isJsonObject,
  isNonBlankString,
  readCweIdentifier,
  readText,
  renderEvidenceSection,
} from "./shared.js";

import type { Normalizer, ObservationCandidate } from "../classifier.js";
import type { SarifDocument, SarifResult, SarifRule, SarifRun } from "../sarif/parser.js";
import type { Diagnostics } from "./shared.js";
import type { Logger } from "pino";

// Reverse ZAP's risk-to-SARIF conversion: NOTE is RISK_LOW, NONE is RISK_INFO.
// These are ZAP-specific meanings, not a generic interpretation of SARIF levels.
// https://github.com/zaproxy/zap-extensions/blob/a72c429382350054f1fc20f01e52eccf3a240585/addOns/reports/src/main/java/org/zaproxy/addon/reports/sarif/SarifLevel.java
const severities = {
  error: VulnerabilitySeverity.High,
  warning: VulnerabilitySeverity.Medium,
  note: VulnerabilitySeverity.Low,
  none: VulnerabilitySeverity.Info,
};

type Subject = Pick<ObservationCandidate, "affectedResource" | "assetIdentifierCandidates">;
type DocumentContext = Omit<SarifDocument, "runs">;
type RunContext = Omit<SarifRun, "results">;
type RuleRelationship = NonNullable<SarifRule["relationships"]>[number];
type ToolComponentReference = NonNullable<RuleRelationship["target"]["toolComponent"]>;
type Taxonomy = NonNullable<SarifRun["taxonomies"]>[number];
type WebExchange = NonNullable<SarifResult["webRequest"] | SarifResult["webResponse"]>;
type ArtifactContent = NonNullable<WebExchange["body"]>;

type Endpoint = {
  scheme: string;
  host: string;
  port: number;
  path: string;
};

type SelectedTarget = {
  reportedUrl: string;
  endpoint: Endpoint;
};

/** One candidate per retained ZAP result, preserving instance order and provenance. */
export class ZapSarifNormalizer implements Normalizer {
  public async normalize(bytes: Uint8Array, logger: Logger): Promise<ObservationCandidate[]> {
    // Validate the whole document first, including results we will later exclude.
    const { runs, ...document } = parseSarif(bytes);
    if (runs === null) {
      throw new Error("zap: /runs is unavailable");
    }

    const candidates: ObservationCandidate[] = [];
    for (const [runIndex, run] of runs.entries()) {
      // Spreading a large run into push() exceeds JavaScript's argument limit.
      for (const candidate of normalizeRun(run, runIndex, document, logger)) {
        candidates.push(candidate);
      }
    }

    return candidates;
  }
}

function normalizeRun(
  run: SarifRun,
  runIndex: number,
  document: DocumentContext,
  logger: Logger,
): ObservationCandidate[] {
  const runLocator = `/runs/${runIndex}`;
  if (run.tool.driver.name !== "ZAP") {
    throw new Error(`zap: ${runLocator}/tool/driver/name is not ZAP`);
  }

  // Missing results mean unavailable analysis, not a successful empty scan.
  // Remove sibling results from the context shared by this run's candidates.
  const { results, ...runContext } = run;
  if (results === undefined) {
    throw new Error(`zap: ${runLocator}/results is unavailable`);
  }
  const runProvenance = summarizeRun(runContext);

  const candidates: ObservationCandidate[] = [];
  for (const [resultIndex, result] of results.entries()) {
    if (isExcludedResult(result)) {
      continue;
    }

    const sourceRecord = `${runLocator}/results/${resultIndex}`;
    const warn: Diagnostics = (field) => {
      // Diagnostics contain structural labels, never source values or payloads.
      logger.warn({ sourceRecord, field }, "zap: ignoring unusable optional value");
    };

    candidates.push(
      normalizeResult(result, sourceRecord, { document, run: runContext, runProvenance }, warn),
    );
  }

  return candidates;
}

/**
 * Drops the driver rule catalog and taxonomy taxa, which are shared by every result and can
 * dominate large reports. Each candidate keeps its own matched rule instead.
 */
function summarizeRun(run: RunContext): RunContext {
  const { rules: _rules, ...driver } = run.tool.driver;
  return {
    ...run,
    tool: { ...run.tool, driver },
    ...(run.taxonomies === undefined
      ? {}
      : { taxonomies: run.taxonomies.map(({ taxa: _taxa, ...taxonomy }) => taxonomy) }),
  };
}

function isExcludedResult(result: SarifResult): boolean {
  if (result.baselineState === "absent") {
    return true;
  }

  // Suppression and confidence are source context, not an instruction to drop
  // detections. Informational and uncertain results are retained as well.
  switch (result.kind) {
    case "pass":
    case "notApplicable":
      return true;
    default:
      return false;
  }
}

function normalizeResult(
  result: SarifResult,
  sourceRecord: string,
  context: { document: DocumentContext; run: RunContext; runProvenance: RunContext },
  warn: Diagnostics,
): ObservationCandidate {
  const { document, run, runProvenance } = context;
  const ruleId = result.ruleId;
  if (ruleId === undefined || ruleId.trim().length === 0) {
    throw new Error(`zap: ${sourceRecord}/ruleId must be nonblank`);
  }

  const rule = findRule(run, ruleId, sourceRecord, warn);
  const level = result.level ?? defaultLevel(result, rule);
  const subject = mapSubject(result, warn);

  return {
    source: "zap",
    sourceRecord,
    title: [rule?.name, rule?.shortDescription?.text].find(isNonBlankString) ?? ruleId,
    description: readText(rule?.fullDescription?.text, "rule.fullDescription.text", warn),
    remediation: readSolution(rule?.properties?.solution, warn),
    severity: severities[level],
    weakness: buildWeakness(ruleId, rule, run, warn),
    ...subject,
    evidence: buildEvidence(result, warn),
    // ZAP supplies no detection time; HTTP dates describe the exchange instead.
    observedAt: null,
    sourceMetadata: {
      // Each candidate owns its provenance, so later edits cannot leak across the report.
      provenance: structuredClone({
        document,
        run: runProvenance,
        result,
        ...(rule === undefined ? {} : { rule }),
      }),
    },
  };
}

function findRule(
  run: RunContext,
  ruleId: string,
  sourceRecord: string,
  warn: Diagnostics,
): SarifRule | undefined {
  // ZAP exports plugin IDs as opaque rule IDs. Match exactly rather than trying
  // to resolve generic SARIF rule indices or tool-component references.
  const matches = (run.tool.driver.rules ?? []).filter((rule) => rule.id === ruleId);
  if (matches.length > 1) {
    throw new Error(`zap: ${sourceRecord}/ruleId has ambiguous driver rules`);
  }

  const rule = matches[0];
  if (rule === undefined) {
    warn("ruleId: missing driver descriptor");
  }

  return rule;
}

/**
 * SARIF 2.1.0 §3.27.10: an absent level is "none" for non-failure kinds; failures fall back to
 * the rule's default configuration, whose own level defaults to "warning".
 */
function defaultLevel(result: SarifResult, rule: SarifRule | undefined): keyof typeof severities {
  if (result.kind !== undefined && result.kind !== "fail") {
    return "none";
  }
  return rule?.defaultConfiguration?.level ?? "warning";
}

function readSolution(value: unknown, warn: Diagnostics): string | null {
  if (value === undefined) {
    return null;
  }

  // Property bags are not structurally validated by the SARIF schema.
  if (!isJsonObject(value)) {
    warn("properties.solution");
    return null;
  }
  return readText(value.text, "properties.solution.text", warn);
}

function buildWeakness(
  ruleId: string,
  rule: SarifRule | undefined,
  run: RunContext,
  warn: Diagnostics,
): ObservationCandidate["weakness"] {
  const identifiers: Record<string, string[]> = { zap: [ruleId] };
  const cwes = readCweIdentifiers(rule, run, warn);
  if (cwes.length > 0) {
    identifiers.cwe = cwes;
  }

  const references = readReferences(rule?.properties?.references, warn);
  return {
    identifiers,
    ...(references.length > 0 ? { references } : {}),
  };
}

function readCweIdentifiers(
  rule: SarifRule | undefined,
  run: RunContext,
  warn: Diagnostics,
): string[] {
  const identifiers = new Set<string>();

  for (const relationship of rule?.relationships ?? []) {
    // Only structured classification links establish CWE identity. The run's
    // other taxa, reference URLs, and prose may describe unrelated weaknesses.
    const impliesClassification = relationship.kinds?.some(
      (kind) => kind === "superset" || kind === "equal",
    );
    if (!impliesClassification) {
      continue;
    }
    if (!referencesCweTaxonomy(relationship.target.toolComponent, run, warn)) {
      continue;
    }

    const id = relationship.target.id;
    if (id === undefined || !/^\d+$/u.test(id)) {
      warn("relationships.target.id");
      continue;
    }

    const cwe = readCweIdentifier(`CWE-${id}`, "relationships.target.id", warn);
    if (cwe !== undefined) {
      identifiers.add(cwe);
    }
  }

  return [...identifiers];
}

function referencesCweTaxonomy(
  reference: ToolComponentReference | undefined,
  run: RunContext,
  warn: Diagnostics,
): boolean {
  if (reference === undefined) {
    return false;
  }

  const hasIdentity =
    reference.name !== undefined || reference.guid !== undefined || reference.index !== undefined;
  if (!hasIdentity) {
    return false;
  }

  const matches = (run.taxonomies ?? []).filter((taxonomy, index) => {
    if (taxonomy.name !== "CWE") {
      return false;
    }

    return matchesToolComponent(taxonomy, index, reference);
  });

  if (matches.length === 1) {
    return true;
  }

  if (reference.name === "CWE") {
    warn("relationships.target.toolComponent");
  }
  return false;
}

function matchesToolComponent(
  taxonomy: Taxonomy,
  index: number,
  reference: ToolComponentReference,
): boolean {
  // Every reported selector must agree; a matching name cannot override a
  // conflicting GUID or index.
  if (reference.name !== undefined && reference.name !== taxonomy.name) {
    return false;
  }
  if (
    reference.guid !== undefined &&
    reference.guid.toLowerCase() !== taxonomy.guid?.toLowerCase()
  ) {
    return false;
  }
  if (reference.index !== undefined && reference.index !== index) {
    return false;
  }

  return true;
}

function readReferences(value: unknown, warn: Diagnostics): string[] {
  if (value === undefined) {
    return [];
  }

  let values: unknown[];
  if (typeof value === "string") {
    values = [value];
  } else if (Array.isArray(value)) {
    values = value;
  } else {
    warn("properties.references");
    return [];
  }

  const references = new Set<string>();
  for (const entry of values) {
    if (!isNonBlankString(entry)) {
      warn("properties.references");
      continue;
    }

    const parsed = weaknessSchema.safeParse({ identifiers: {}, references: [entry] });
    if (!parsed.success) {
      warn("properties.references");
      continue;
    }

    for (const reference of parsed.data.references ?? []) {
      references.add(reference);
    }
  }

  return [...references];
}

function mapSubject(result: SarifResult, warn: Diagnostics): Subject {
  const target = selectTarget(result, warn);
  if (target === undefined) {
    return {
      affectedResource: { type: AffectedResourceType.Unspecified },
      assetIdentifierCandidates: [],
    };
  }

  const method = readHttpMethod(result.webRequest?.method, warn);
  return {
    affectedResource: {
      type: AffectedResourceType.WebEndpoint,
      ...target.endpoint,
      ...(method === undefined ? {} : { method }),
      component: { kind: WebEndpointComponentKind.Endpoint },
      reportedUrl: target.reportedUrl,
    },
    assetIdentifierCandidates: identifiersForHost(target.endpoint.host, warn),
  };
}

function selectTarget(result: SarifResult, warn: Diagnostics): SelectedTarget | undefined {
  let selected: SelectedTarget | undefined;

  for (const location of result.locations ?? []) {
    const target = parseHttpTarget(location.physicalLocation?.artifactLocation?.uri);
    if (target === undefined) {
      continue;
    }

    if (selected === undefined) {
      selected = target;
      continue;
    }

    if (!sameEndpoint(selected.endpoint, target.endpoint)) {
      // A request target must not override conflicting primary locations.
      warn("locations: conflicting endpoints");
      return undefined;
    }
  }

  // Equivalent locations retain the first reported URL, including its query.
  // Relative/indexed locations stay unresolved and allow a request fallback.
  return selected ?? parseHttpTarget(result.webRequest?.target);
}

function parseHttpTarget(reportedUrl: string | undefined): SelectedTarget | undefined {
  // Require an explicit HTTP(S) authority so URL repair cannot invent a host.
  if (reportedUrl === undefined || !/^https?:\/\/[^/?#]/iu.test(reportedUrl)) {
    return undefined;
  }

  // webRequest.target is an unconstrained SARIF string. Reject malformed raw
  // syntax before WHATWG can discard controls, repair slashes, or escape text.
  if (!uriSchema.safeParse(reportedUrl).success) {
    return undefined;
  }

  let url: URL;
  try {
    url = new URL(reportedUrl);
  } catch {
    return undefined;
  }
  if (url.hostname === "") {
    return undefined;
  }

  // WHATWG URL removes default ports; materialize them for endpoint comparison.
  let port = Number(url.port);
  if (url.port === "") {
    port = url.protocol === "https:" ? 443 : 80;
  }

  return {
    reportedUrl,
    endpoint: {
      scheme: url.protocol.slice(0, -1),
      host: url.hostname,
      port,
      path: url.pathname || "/",
    },
  };
}

function sameEndpoint(first: Endpoint, second: Endpoint): boolean {
  return (
    first.scheme === second.scheme &&
    first.host === second.host &&
    first.port === second.port &&
    first.path === second.path
  );
}

function readHttpMethod(method: string | undefined, warn: Diagnostics): string | undefined {
  if (method === undefined) {
    return undefined;
  }

  // HTTP methods are tokens, including extension methods. Never infer one from
  // an alert title, evidence snippet, or attack payload.
  if (!/^[!#$%&'*+.^_`|~\da-z-]+$/iu.test(method)) {
    warn("webRequest.method");
    return undefined;
  }

  return method;
}

function identifiersForHost(host: string, warn: Diagnostics): Subject["assetIdentifierCandidates"] {
  // URL hostnames retain IPv6 brackets; canonical IP identifiers do not.
  const value = host.replace(/^\[|\]$/gu, "");
  const ip = assetIdentifierSchema.safeParse({
    type: AssetIdentifierType.IpAddress,
    namespace: null,
    value,
  });
  if (ip.success) {
    return [ip.data];
  }

  const dns = assetIdentifierSchema.safeParse({
    type: AssetIdentifierType.DnsName,
    namespace: null,
    value,
  });
  if (dns.success) {
    return [dns.data];
  }

  warn("locations: target host");
  return [];
}

function buildEvidence(result: SarifResult, warn: Diagnostics): string | null {
  const sections: string[] = [];
  appendEvidenceSection(
    sections,
    "Message",
    [result.message.text, result.message.markdown].find(isNonBlankString),
  );

  for (const location of result.locations ?? []) {
    const physicalLocation = location.physicalLocation;
    appendArtifactSection(sections, "Snippet", physicalLocation?.region?.snippet);
    appendArtifactSection(sections, "Context Snippet", physicalLocation?.contextRegion?.snippet);

    appendEvidenceSection(
      sections,
      "Attack",
      readText(location.properties?.attack, "locations.properties.attack", warn),
    );
  }

  appendEvidenceSection(sections, "Request (exported fields)", renderExchange(result.webRequest));
  const parameters = Object.entries(result.webRequest?.parameters ?? {}).map(
    ([name, value]) => `${name}: ${value}`,
  );
  appendEvidenceSection(sections, "Request Parameters", parameters.join("\n"));
  appendEvidenceSection(sections, "Response (exported fields)", renderExchange(result.webResponse));

  return sections.length === 0 ? null : sections.join("\n\n");
}

function appendEvidenceSection(
  sections: string[],
  label: string,
  content: string | null | undefined,
): void {
  // Blank text is absent; nonblank text is kept verbatim.
  if (!isNonBlankString(content)) {
    return;
  }

  // Match the Nuclei presentation, preserving multiline text and truncation markers.
  sections.push(renderEvidenceSection(label, content));
}

function readArtifactEvidence(
  artifact: ArtifactContent | undefined,
): { text: string; rendered: boolean } | undefined {
  const originalText = artifact?.text;
  if (isNonBlankString(originalText)) {
    return { text: originalText, rendered: false };
  }

  // A rendered representation is still useful evidence, but label it so it
  // cannot be mistaken for the original body/snippet bytes. Keep both in provenance.
  const renderedText = [artifact?.rendered?.text, artifact?.rendered?.markdown].find(
    isNonBlankString,
  );
  if (renderedText !== undefined) {
    return { text: renderedText, rendered: true };
  }

  return undefined;
}

function appendArtifactSection(
  sections: string[],
  label: string,
  artifact: ArtifactContent | undefined,
): void {
  const evidence = readArtifactEvidence(artifact);
  if (evidence !== undefined) {
    appendEvidenceSection(
      sections,
      evidence.rendered ? `${label} (rendered)` : label,
      evidence.text,
    );
  }
}

function renderExchange(exchange: WebExchange | undefined): string | undefined {
  if (exchange === undefined) {
    return undefined;
  }

  // Display exported fields rather than reconstructing a wire-exact capture.
  // Property bags and binary bodies remain available in raw provenance.
  const fields: string[] = [];
  for (const [key, value] of Object.entries(exchange)) {
    switch (key) {
      case "body":
      case "properties":
      case "headers":
        continue;
    }

    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      fields.push(`${key}: ${value}`);
    }
  }

  for (const [key, value] of Object.entries(exchange.headers ?? {})) {
    fields.push(`${key}: ${value}`);
  }
  const body = readArtifactEvidence(exchange.body);
  if (body !== undefined) {
    fields.push("");
    if (body.rendered) {
      fields.push("Body (rendered):");
    }
    fields.push(body.text);
  }

  return fields.join("\n");
}
