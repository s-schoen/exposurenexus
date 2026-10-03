import { assetIdentifierSchema } from "@exposurenexus/backend/assets";
import { weaknessSchema } from "@exposurenexus/backend/findings";
import {
  AffectedResourceType,
  WebEndpointComponentKind,
} from "@exposurenexus/contracts/model/affected-resource";
import { AssetIdentifierType } from "@exposurenexus/contracts/model/asset-identifier";
import { VulnerabilitySeverity } from "@exposurenexus/contracts/model/vulnerability";

import {
  isJsonObject,
  isNonBlankString,
  readDateTime,
  readText,
  renderEvidenceSection,
} from "./shared.js";

import type { Normalizer, ObservationCandidate } from "../classifier.js";
import type { JsonObject } from "./shared.js";
import type { ObservationAffectedResource } from "@exposurenexus/contracts/model/affected-resource";
import type { AssetIdentifier } from "@exposurenexus/contracts/model/asset-identifier";
import type {
  CvssAssessment,
  EpssAssessment,
  Weakness,
} from "@exposurenexus/contracts/model/weakness";
import type { Logger } from "pino";

type WebEndpointResource = Extract<
  ObservationAffectedResource,
  { type: AffectedResourceType.WebEndpoint }
>;

type NetworkServiceResource = Extract<
  ObservationAffectedResource,
  { type: AffectedResourceType.NetworkService }
>;

type SubjectMapping = {
  affectedResource: ObservationAffectedResource;
  assetIdentifierCandidates: AssetIdentifier[];
};

/** Transport/application details each network-service protocol establishes. */
type NetworkServiceDetails = {
  transport?: string;
  protocol?: string;
  /**
   * Whether the reported `ip` describes the dialed subject itself. TCP, TLS,
   * and JavaScript report the IP of the matched/dialed address (TLS via the
   * TLS response's remote address); HTTP and WebSocket report the original
   * input target's IP.
   */
  ipTracksDialedAddress?: boolean;
};

type ParsedRecord = {
  record: JsonObject;
  templateId: string;
  type: string;
};

const sourceName = "nuclei";

/** Protocols whose subject mapping is defined by the HTTP/headless slice. */
const webProtocols = new Set(["http", "headless"]);

/**
 * Protocols that establish a network service. The result type only carries the
 * transport layer; an application protocol is never inferred from template
 * names, payloads, or port numbers.
 */
const networkServiceProtocols = new Map<string, NetworkServiceDetails>([
  ["tcp", { transport: "tcp", ipTracksDialedAddress: true }],
  ["ssl", { transport: "tcp", protocol: "tls", ipTracksDialedAddress: true }],
  ["javascript", { ipTracksDialedAddress: true }],
]);

type SubjectIdentifierResolver = (host: string) => AssetIdentifier[];

/**
 * Protocols whose reported host is the affected subject but whose detections
 * have no narrower shared resource type. WHOIS derives identifiers under its
 * own rules because ASNs, network ranges, and handles are not hostnames.
 */
const queriedHostProtocols = new Map<string, SubjectIdentifierResolver>([
  ["dns", identifiersForHost],
  ["whois", identifiersForWhoisSubject],
]);

const defaultPorts = new Map<string, number>([
  ["http", 80],
  ["https", 443],
  ["ws", 80],
  ["wss", 443],
]);

const fuzzingPositionKinds = new Map<string, WebEndpointComponentKind>([
  ["query", WebEndpointComponentKind.QueryParameter],
  ["path", WebEndpointComponentKind.PathParameter],
  ["header", WebEndpointComponentKind.Header],
  ["cookie", WebEndpointComponentKind.Cookie],
  ["body", WebEndpointComponentKind.BodyField],
]);

const knownSeverities = new Set<string>(Object.values(VulnerabilitySeverity));

/**
 * Normalizes a Nuclei JSONL scan into observation candidates.
 *
 * One source record yields exactly one candidate, including informational
 * detections. Malformed records, invalid required fields, and invalid
 * detection-status fields reject the whole file with a log-safe error that
 * identifies the physical line; failure records are skipped with a debug log.
 */
export class NucleiNormalizer implements Normalizer {
  public async normalize(scanData: Uint8Array, logger: Logger): Promise<ObservationCandidate[]> {
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(scanData);
    } catch {
      throw new Error("nuclei: invalid UTF-8");
    }
    if (text.trim().length === 0) {
      return [];
    }

    const candidates: ObservationCandidate[] = [];

    for (const [index, line] of text.split(/\r?\n/u).entries()) {
      // Blank lines still advance the physical line number used in locators.
      if (line.trim().length === 0) {
        continue;
      }

      const lineNumber = index + 1;
      const parsed = parseRecord(line, lineNumber, logger);
      if (parsed !== null) {
        candidates.push(normalizeRecord(parsed, lineNumber, logger));
      }
    }

    return candidates;
  }
}

function parseRecord(line: string, lineNumber: number, logger: Logger): ParsedRecord | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    throw new Error(`nuclei: invalid JSON on line ${lineNumber}`);
  }

  if (!isJsonObject(parsed)) {
    throw new Error(`nuclei: line ${lineNumber} is not a JSON object`);
  }

  // Detection-status fields are validated before skipping so that malformed
  // status values reject the file instead of being silently ignored.
  const matcherStatus = parsed["matcher-status"];
  if (matcherStatus !== undefined && matcherStatus !== null && typeof matcherStatus !== "boolean") {
    throw new Error(`nuclei: line ${lineNumber} has an invalid matcher-status field`);
  }

  const errorValue = parsed.error;
  if (errorValue !== undefined && errorValue !== null && typeof errorValue !== "string") {
    throw new Error(`nuclei: line ${lineNumber} has an invalid error field`);
  }

  if (matcherStatus === false) {
    debugSkip(logger, lineNumber, "matcher-status is false");
    return null;
  }
  // An empty error string is not a failure; only a nonempty report skips the record.
  if (typeof errorValue === "string" && errorValue.trim().length > 0) {
    debugSkip(logger, lineNumber, "error reported");
    return null;
  }

  // Required fields are checked after skipping so failure records cannot reject a valid file.
  const templateId = parsed["template-id"];
  if (!isNonBlankString(templateId)) {
    throw new Error(`nuclei: line ${lineNumber} has an invalid template-id`);
  }
  if (typeof parsed.type !== "string") {
    throw new Error(`nuclei: line ${lineNumber} has an invalid type`);
  }

  return { record: parsed, templateId: templateId.trim(), type: parsed.type };
}

function normalizeRecord(
  parsed: ParsedRecord,
  lineNumber: number,
  logger: Logger,
): ObservationCandidate {
  const { record, templateId, type } = parsed;
  const info = readInfo(record, lineNumber, logger);
  const matcherName = readTextValue(record["matcher-name"], "matcher-name", lineNumber, logger);
  const subject = mapSubject(record, type, lineNumber, logger);

  return {
    source: sourceName,
    sourceRecord: `line:${lineNumber}`,
    title: buildTitle(info, templateId, matcherName, lineNumber, logger),
    description: readNullableText(info.description, "description", lineNumber, logger),
    remediation: readNullableText(info.remediation, "remediation", lineNumber, logger),
    evidence: buildEvidence(record, lineNumber, logger),
    severity: readSeverity(info.severity, lineNumber, logger),
    weakness: buildWeakness(info, templateId, matcherName, lineNumber, logger),
    affectedResource: subject.affectedResource,
    observedAt: readObservedAt(record.timestamp, lineNumber, logger),
    assetIdentifierCandidates: subject.assetIdentifierCandidates,
    // The whole parsed record is kept verbatim: duplicating mapped fields is
    // cheap, while unmapped fields, unusable originals, tag/author context, and
    // original target details must all survive under their original names.
    sourceMetadata: record,
  };
}

function readInfo(record: JsonObject, lineNumber: number, logger: Logger): JsonObject {
  // The info block is optional in programmatic output; a malformed one only
  // loses descriptive fields, so fall back instead of rejecting the record.
  const info = record.info;
  if (info === undefined || info === null) {
    return {};
  }
  if (!isJsonObject(info)) {
    warnUnusable(logger, lineNumber, "info");
    return {};
  }
  return info;
}

function buildTitle(
  info: JsonObject,
  templateId: string,
  matcherName: string | undefined,
  lineNumber: number,
  logger: Logger,
): string {
  const name = readTextValue(info.name, "name", lineNumber, logger)?.trim();
  const base = name === undefined ? templateId : name;
  if (matcherName === undefined) {
    return base;
  }

  const suffix = matcherName.trim();
  // Skip the suffix when the title already names the matcher; matcher labels
  // must not add repeated text or unrelated metadata noise to the title.
  if (suffix.length === 0 || base.toLowerCase().includes(suffix.toLowerCase())) {
    return base;
  }

  return `${base} (${suffix})`;
}

function buildEvidence(record: JsonObject, lineNumber: number, logger: Logger): string | null {
  const sections: string[] = [];

  const request = readTextValue(record.request, "request", lineNumber, logger);
  if (request !== undefined) {
    sections.push(renderEvidenceSection("Request", request));
  }

  const response = readTextValue(record.response, "response", lineNumber, logger);
  if (response !== undefined) {
    sections.push(renderEvidenceSection("Response", response));
  }

  const extractedResults = readExtractedResults(record["extracted-results"], lineNumber, logger);
  if (extractedResults.length > 0) {
    sections.push(renderEvidenceSection("Extracted Results", extractedResults.join("\n")));
  }

  const reproduction = readTextValue(record["curl-command"], "curl-command", lineNumber, logger);
  if (reproduction !== undefined) {
    sections.push(renderEvidenceSection("Reproduction", reproduction));
  }

  return sections.length === 0 ? null : sections.join("\n\n");
}

function readExtractedResults(value: unknown, lineNumber: number, logger: Logger): string[] {
  if (value === undefined || value === null) {
    return [];
  }

  const values = typeof value === "string" ? [value] : Array.isArray(value) ? value : undefined;
  if (values === undefined) {
    warnUnusable(logger, lineNumber, "extracted-results");
    return [];
  }

  const results: string[] = [];
  for (const entry of values) {
    if (typeof entry !== "string") {
      warnUnusable(logger, lineNumber, "extracted-results");
      continue;
    }
    if (entry.trim().length > 0) {
      results.push(entry);
    }
  }
  return results;
}

function buildWeakness(
  info: JsonObject,
  templateId: string,
  matcherName: string | undefined,
  lineNumber: number,
  logger: Logger,
): Weakness {
  const classification = readClassification(info, lineNumber, logger);
  const identifiers: Record<string, string[]> = { nuclei: [templateId] };

  const cveIds = canonicalizeIdentifiers(
    "cve",
    "cve-id",
    classification["cve-id"],
    lineNumber,
    logger,
  );
  if (cveIds.length > 0) {
    identifiers.cve = cveIds;
  }

  const cweIds = canonicalizeIdentifiers(
    "cwe",
    "cwe-id",
    classification["cwe-id"],
    lineNumber,
    logger,
  );
  if (cweIds.length > 0) {
    identifiers.cwe = cweIds;
  }

  if (matcherName !== undefined) {
    identifiers["nuclei-matcher"] = [`${templateId}:${matcherName.trim()}`];
  }

  const references = readReferences(info, lineNumber, logger);
  const cvss = readCvss(classification, lineNumber, logger);
  const epss = readEpss(classification, lineNumber, logger);

  return {
    identifiers,
    ...(references.length > 0 ? { references } : {}),
    ...(cvss === undefined ? {} : { cvss }),
    ...(epss === undefined ? {} : { epss }),
  };
}

function readClassification(info: JsonObject, lineNumber: number, logger: Logger): JsonObject {
  // Templates without classification emit null or omit the block entirely.
  const classification = info.classification;
  if (classification === undefined || classification === null) {
    return {};
  }
  if (!isJsonObject(classification)) {
    warnUnusable(logger, lineNumber, "classification");
    return {};
  }
  return classification;
}

function canonicalizeIdentifiers(
  namespace: string,
  field: string,
  value: unknown,
  lineNumber: number,
  logger: Logger,
): string[] {
  if (value === undefined || value === null) {
    return [];
  }

  const values = typeof value === "string" ? [value] : Array.isArray(value) ? value : undefined;
  if (values === undefined) {
    warnUnusable(logger, lineNumber, field);
    return [];
  }

  const reported: string[] = [];
  for (const entry of values) {
    if (typeof entry !== "string") {
      warnUnusable(logger, lineNumber, field);
      continue;
    }
    if (entry.trim().length > 0) {
      reported.push(entry.trim());
    }
  }

  const unique = [...new Set(reported)];
  // The backend schema canonicalizes a whole namespace at once, so fall back to
  // validating each value separately to keep the usable identifiers.
  const canonical = weaknessSchema.safeParse({ identifiers: { [namespace]: unique } });
  if (canonical.success) {
    return canonical.data.identifiers[namespace] ?? [];
  }

  // With one unusable identifier the whole namespace fails to parse; retain
  // every value that still canonicalizes on its own.
  const usable = new Set<string>();
  for (const entry of unique) {
    const single = weaknessSchema.safeParse({ identifiers: { [namespace]: [entry] } });
    if (single.success) {
      for (const identifier of single.data.identifiers[namespace] ?? []) {
        usable.add(identifier);
      }
    } else {
      warnUnusable(logger, lineNumber, field);
    }
  }
  return [...usable].sort();
}

function readReferences(info: JsonObject, lineNumber: number, logger: Logger): string[] {
  const value = info.reference;
  if (value === undefined || value === null) {
    return [];
  }

  const values = typeof value === "string" ? [value] : Array.isArray(value) ? value : undefined;
  if (values === undefined) {
    warnUnusable(logger, lineNumber, "reference");
    return [];
  }

  const references: string[] = [];
  for (const entry of values) {
    if (typeof entry !== "string") {
      warnUnusable(logger, lineNumber, "reference");
      continue;
    }
    if (entry.trim().length > 0) {
      references.push(entry);
    }
  }

  // Deduplication preserves reference text, casing, and first-occurrence order.
  return [...new Set(references)];
}

function readCvss(
  classification: JsonObject,
  lineNumber: number,
  logger: Logger,
): CvssAssessment[] | undefined {
  const score = readBoundedNumber(
    classification["cvss-score"],
    0,
    10,
    "cvss-score",
    lineNumber,
    logger,
  );
  const vector = readTextValue(
    classification["cvss-metrics"],
    "cvss-metrics",
    lineNumber,
    logger,
  )?.trim();

  if (score === undefined && vector === undefined) {
    return undefined;
  }

  // The vector prefix is the only source of the CVSS version; partial
  // assessments (score-only or vector-only) are preserved as reported.
  const version = vector === undefined ? undefined : versionFromVector(vector);
  return [
    {
      ...(score === undefined ? {} : { score }),
      ...(vector === undefined ? {} : { vector }),
      ...(version === undefined ? {} : { version }),
    },
  ];
}

function readEpss(
  classification: JsonObject,
  lineNumber: number,
  logger: Logger,
): EpssAssessment | undefined {
  const score = readBoundedNumber(
    classification["epss-score"],
    0,
    1,
    "epss-score",
    lineNumber,
    logger,
  );
  const percentile = readBoundedNumber(
    classification["epss-percentile"],
    0,
    1,
    "epss-percentile",
    lineNumber,
    logger,
  );

  if (score === undefined && percentile === undefined) {
    return undefined;
  }

  return {
    ...(score === undefined ? {} : { score }),
    ...(percentile === undefined ? {} : { percentile }),
  };
}

function versionFromVector(vector: string): string | undefined {
  // Vectors carry their version as a "CVSS:x.y/" prefix, though programmatic
  // output sometimes omits the "CVSS:" marker.
  return /^(?:CVSS:)?(\d+(?:\.\d+)?)\//iu.exec(vector)?.[1];
}

function readBoundedNumber(
  value: unknown,
  minimum: number,
  maximum: number,
  field: string,
  lineNumber: number,
  logger: Logger,
): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    warnUnusable(logger, lineNumber, field);
    return undefined;
  }
  return value;
}

function readSeverity(value: unknown, lineNumber: number, logger: Logger): VulnerabilitySeverity {
  if (value === undefined || value === null) {
    return VulnerabilitySeverity.Info;
  }
  if (typeof value !== "string") {
    warnUnusable(logger, lineNumber, "severity");
    return VulnerabilitySeverity.Info;
  }

  const normalized = value.trim().toLowerCase();
  if (knownSeverities.has(normalized)) {
    return normalized as VulnerabilitySeverity;
  }
  // Unrecognized severities become info; the raw value stays in source metadata.
  if (normalized.length > 0) {
    warnUnusable(logger, lineNumber, "severity");
  }
  return VulnerabilitySeverity.Info;
}

function readObservedAt(value: unknown, lineNumber: number, logger: Logger): Date | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string") {
    warnUnusable(logger, lineNumber, "timestamp");
    return null;
  }

  // Nuclei reports RFC 3339 timestamps. Lenient Date parsing would turn malformed or
  // out-of-range text into a different instant, so an invalid report means the
  // observation time is unknown; never substitute "now".
  const observedAt = readDateTime(value);
  if (observedAt === null) {
    warnUnusable(logger, lineNumber, "timestamp");
    return null;
  }
  return observedAt;
}

function mapSubject(
  record: JsonObject,
  type: string,
  lineNumber: number,
  logger: Logger,
): SubjectMapping {
  const protocol = type.trim().toLowerCase();
  if (webProtocols.has(protocol)) {
    return mapWebSubject(record, lineNumber, logger);
  }

  const networkDetails = networkServiceProtocols.get(protocol);
  if (networkDetails !== undefined) {
    return mapNetworkServiceSubject(record, lineNumber, logger, networkDetails);
  }

  if (protocol === "websocket") {
    return mapWebSocketSubject(record, lineNumber, logger);
  }

  // DNS and WHOIS report the queried host as the affected subject, but the
  // shared resource vocabulary has no DNS-record or registration type.
  const queriedHostResolver = queriedHostProtocols.get(protocol);
  if (queriedHostResolver !== undefined) {
    return mapQueriedHostSubject(record, lineNumber, logger, queriedHostResolver);
  }

  // File, code, offline-HTTP-style, and unknown future protocols identify
  // their subject through scanner-local paths; keep the detection without
  // inventing an asset identity.
  return unspecifiedSubject();
}

/**
 * Maps a result whose only usable subject detail is the reported queried host.
 * The resource stays unspecified because there is no narrower shared type.
 */
function mapQueriedHostSubject(
  record: JsonObject,
  lineNumber: number,
  logger: Logger,
  resolveIdentifiers: SubjectIdentifierResolver,
): SubjectMapping {
  const host = readTextValue(record.host, "host", lineNumber, logger)?.trim();
  return {
    affectedResource: { type: AffectedResourceType.Unspecified },
    assetIdentifierCandidates: host === undefined ? [] : resolveIdentifiers(host),
  };
}

function mapWebSubject(record: JsonObject, lineNumber: number, logger: Logger): SubjectMapping {
  const endpoint = resolveWebEndpoint(record, lineNumber, logger);
  if (endpoint === null) {
    return unspecifiedSubject();
  }

  return subjectMappingForResource(record, endpoint.host, endpoint, false, lineNumber, logger);
}

function mapNetworkServiceSubject(
  record: JsonObject,
  lineNumber: number,
  logger: Logger,
  details: NetworkServiceDetails,
): SubjectMapping {
  const address = resolveNetworkAddress(record, lineNumber, logger);
  if (address === null) {
    return unspecifiedSubject();
  }

  const resource: NetworkServiceResource = {
    type: AffectedResourceType.NetworkService,
    host: address.host,
    ...(address.port === undefined ? {} : { port: address.port }),
    ...(details.transport === undefined ? {} : { transport: details.transport }),
    ...(details.protocol === undefined ? {} : { protocol: details.protocol }),
  };

  // Only protocols whose reported IP belongs to the dialed address may keep it
  // when the matched host differs from the original input host.
  const subjectIsDialedAddress =
    details.ipTracksDialedAddress === true && address.fromMatchedAddress;
  return subjectMappingForResource(
    record,
    address.host,
    resource,
    subjectIsDialedAddress,
    lineNumber,
    logger,
  );
}

function mapWebSocketSubject(
  record: JsonObject,
  lineNumber: number,
  logger: Logger,
): SubjectMapping {
  // The websocket matched address is the URL actually dialed, so it wins over
  // the original input URL. Its reported IP is looked up for the original
  // input host, so it is attributed only when the subject still matches it.
  const matchedAt = readWebSocketAddress(record["matched-at"], "matched-at", lineNumber, logger);
  if (matchedAt !== null) {
    return webSocketSubjectMapping(record, matchedAt, lineNumber, logger);
  }

  const url = readWebSocketAddress(record.url, "url", lineNumber, logger);
  if (url !== null) {
    return webSocketSubjectMapping(record, url, lineNumber, logger);
  }

  const hostText = readTextValue(record.host, "host", lineNumber, logger)?.trim();
  if (hostText === undefined) {
    return unspecifiedSubject();
  }

  const fields = resolveExplicitWebEndpoint(record, hostText, lineNumber, logger);
  if (fields === null) {
    return unspecifiedSubject();
  }

  const resource: WebEndpointResource = {
    type: AffectedResourceType.WebEndpoint,
    ...(fields.scheme === undefined ? {} : { scheme: fields.scheme }),
    host: fields.host,
    ...(fields.port === undefined ? {} : { port: fields.port }),
    ...(fields.path === undefined ? {} : { path: fields.path }),
    // A websocket payload is not an HTTP request, so it never establishes a
    // method or a fuzzing component; only the endpoint itself is known.
    component: { kind: WebEndpointComponentKind.Endpoint },
  };
  return subjectMappingForResource(record, fields.host, resource, false, lineNumber, logger);
}

function webSocketSubjectMapping(
  record: JsonObject,
  address: WebSocketAddress,
  lineNumber: number,
  logger: Logger,
): SubjectMapping {
  const scheme = address.scheme;
  // Nuclei strips default ports from URLs, so materialize the standard port
  // again for the scheme the URL establishes.
  const port = address.port ?? defaultPorts.get(scheme);
  const resource: WebEndpointResource = {
    type: AffectedResourceType.WebEndpoint,
    scheme,
    host: address.host,
    ...(port === undefined ? {} : { port }),
    path: address.path === undefined || address.path === "" ? "/" : address.path,
    component: { kind: WebEndpointComponentKind.Endpoint },
    ...(address.reportedUrl === undefined ? {} : { reportedUrl: address.reportedUrl }),
  };
  return subjectMappingForResource(record, address.host, resource, false, lineNumber, logger);
}

function subjectMappingForResource(
  record: JsonObject,
  host: string | undefined,
  resource: ObservationAffectedResource,
  subjectIsDialedAddress: boolean,
  lineNumber: number,
  logger: Logger,
): SubjectMapping {
  const identifiers = identifiersForHost(host);
  const reportedIp = reportedIpIdentifier(record, host, lineNumber, logger, subjectIsDialedAddress);
  if (reportedIp !== undefined) {
    identifiers.push(reportedIp);
  }

  return {
    affectedResource: resource,
    assetIdentifierCandidates: dedupeIdentifiers(identifiers),
  };
}

function unspecifiedSubject(): SubjectMapping {
  return {
    affectedResource: { type: AffectedResourceType.Unspecified },
    assetIdentifierCandidates: [],
  };
}

function resolveWebEndpoint(
  record: JsonObject,
  lineNumber: number,
  logger: Logger,
): WebEndpointResource | null {
  // matched-at is the target the matcher actually hit (post-redirect), so it
  // wins over the original url; only an HTTP(S) value is a usable endpoint.
  const matchedAtText = readTextValue(
    record["matched-at"],
    "matched-at",
    lineNumber,
    logger,
  )?.trim();
  const matchedAt = parseHttpUrl(matchedAtText);
  if (matchedAt !== null) {
    return webEndpointFromUrl(matchedAt, matchedAtText, record, lineNumber, logger);
  }

  const urlText = readTextValue(record.url, "url", lineNumber, logger)?.trim();
  const url = parseHttpUrl(urlText);
  if (url !== null) {
    return webEndpointFromUrl(url, urlText, record, lineNumber, logger);
  }

  const host = readTextValue(record.host, "host", lineNumber, logger)?.trim();
  if (host === undefined) {
    return null;
  }

  // Explicit fields are parsed as an authority plus a separate path; building a
  // URL from them would let path text rewrite the host.
  return webEndpointFromFields(record, host, lineNumber, logger);
}

function webEndpointFromUrl(
  url: URL,
  reportedUrl: string | undefined,
  record: JsonObject,
  lineNumber: number,
  logger: Logger,
): WebEndpointResource {
  const scheme = url.protocol.slice(0, -1);
  // Nuclei strips default ports from URL fields, so materialize the standard
  // port again to keep the endpoint complete.
  const port = url.port === "" ? defaultPorts.get(scheme) : Number(url.port);
  const method = readHttpMethod(record, lineNumber, logger);
  const component = readFuzzingComponent(record, lineNumber, logger);

  return {
    type: AffectedResourceType.WebEndpoint,
    scheme,
    host: url.hostname,
    ...(port === undefined ? {} : { port }),
    path: url.pathname === "" ? "/" : url.pathname,
    ...(method === undefined ? {} : { method }),
    component,
    ...(reportedUrl === undefined ? {} : { reportedUrl }),
  };
}

type HostAuthority = {
  host: string;
  port: number | undefined;
  /** Whether the authority text itself carried a port, valid or not. */
  portReported: boolean;
};

/** Rejects authority text containing path, userinfo, query, backslash, or whitespace. */
const authorityTextPattern = /[/?#@\\\s]/u;

/**
 * Splits and normalizes an explicit host field without any path involvement, so
 * path contents can never change the affected host. Handles bracketed hosts,
 * bare IPv6 (as Nuclei v3 emits), and embedded ports without relying on URL
 * default-port normalization, which would silently drop port 80/443.
 */
function parseHostAuthority(value: string): HostAuthority | null {
  const text = value.trim();
  if (text.length === 0) {
    return null;
  }

  let hostText = text;
  let portText: string | undefined;
  if (text.startsWith("[")) {
    const closing = text.indexOf("]");
    if (closing === -1) {
      return null;
    }
    hostText = text.slice(0, closing + 1);
    const remainder = text.slice(closing + 1);
    if (remainder.startsWith(":")) {
      portText = remainder.slice(1);
    } else if (remainder.length > 0) {
      return null;
    }
  } else {
    const firstColon = text.indexOf(":");
    // A single colon separates host and port; multiple colons are a bare IPv6 address.
    if (firstColon !== -1 && firstColon === text.lastIndexOf(":")) {
      hostText = text.slice(0, firstColon);
      portText = text.slice(firstColon + 1);
    }
  }

  const host = normalizeAuthorityHost(hostText);
  if (host === null) {
    return null;
  }

  return {
    host,
    port: portText === undefined ? undefined : parsePortText(portText),
    portReported: portText !== undefined,
  };
}

function readHostAuthority(
  value: string,
  lineNumber: number,
  logger: Logger,
): HostAuthority | null {
  const authority = parseHostAuthority(value);
  if (authority === null) {
    warnUnusable(logger, lineNumber, "host");
    return null;
  }
  if (authority.portReported && authority.port === undefined) {
    warnUnusable(logger, lineNumber, "port");
  }
  return authority;
}

function normalizeAuthorityHost(hostText: string): string | null {
  if (authorityTextPattern.test(hostText)) {
    return null;
  }

  const bracketed =
    hostText.includes(":") && !hostText.startsWith("[") ? `[${hostText}]` : hostText;
  try {
    const url = new URL(`http://${bracketed}`);
    return url.hostname.length === 0 ? null : url.hostname;
  } catch {
    return null;
  }
}

type ExplicitWebEndpoint = {
  scheme: string | undefined;
  host: string;
  port: number | undefined;
  path: string | undefined;
};

/**
 * Builds the endpoint details carried by explicit source fields, shared by the
 * HTTP/headless and WebSocket fallbacks. Method and component stay
 * protocol-specific because a WebSocket payload never establishes an HTTP
 * request line or a fuzzing component.
 */
function resolveExplicitWebEndpoint(
  record: JsonObject,
  hostValue: string,
  lineNumber: number,
  logger: Logger,
): ExplicitWebEndpoint | null {
  const authority = readHostAuthority(hostValue, lineNumber, logger);
  if (authority === null) {
    return null;
  }

  const schemeText = readTextValue(record.scheme, "scheme", lineNumber, logger)?.trim();
  const scheme =
    schemeText !== undefined && /^[a-z][a-z\d+.-]*$/iu.test(schemeText)
      ? schemeText.toLowerCase()
      : undefined;
  if (schemeText !== undefined && scheme === undefined) {
    warnUnusable(logger, lineNumber, "scheme");
  }

  const reportedPort = authority.port ?? parsePort(record.port, lineNumber, logger);
  const port = reportedPort ?? (scheme === undefined ? undefined : defaultPorts.get(scheme));
  const reportedPath = readTextValue(record.path, "path", lineNumber, logger);
  let path: string | undefined;
  if (reportedPath !== undefined) {
    path = reportedPath.startsWith("/") ? reportedPath : `/${reportedPath}`;
  } else if (scheme !== undefined) {
    // A known scheme forms a URL, so a missing path means the root path.
    path = "/";
  }

  return { scheme, host: authority.host, port, path };
}

function webEndpointFromFields(
  record: JsonObject,
  hostValue: string,
  lineNumber: number,
  logger: Logger,
): WebEndpointResource | null {
  const fields = resolveExplicitWebEndpoint(record, hostValue, lineNumber, logger);
  if (fields === null) {
    return null;
  }

  const method = readHttpMethod(record, lineNumber, logger);
  const component = readFuzzingComponent(record, lineNumber, logger);

  return {
    type: AffectedResourceType.WebEndpoint,
    ...(fields.scheme === undefined ? {} : { scheme: fields.scheme }),
    host: fields.host,
    ...(fields.port === undefined ? {} : { port: fields.port }),
    ...(fields.path === undefined ? {} : { path: fields.path }),
    ...(method === undefined ? {} : { method }),
    component,
  };
}

type ResolvedNetworkAddress = {
  host: string;
  port: number | undefined;
  /** Whether the matched/dialed address established the subject. */
  fromMatchedAddress: boolean;
};

type ParsedAddress = {
  host: string;
  port: number | undefined;
  /** Whether the address text itself carried a port, valid or not. */
  portReported: boolean;
  scheme: string | undefined;
  path: string | undefined;
  reportedUrl: string | undefined;
};

type WebSocketAddress = ParsedAddress & { scheme: "ws" | "wss" };

const schemeTextPattern = /^[a-z][a-z\d+.-]*:\/\//iu;

/**
 * Resolves the service address for TCP, TLS, and JavaScript results, preferring
 * the matched/dialed address, then the reported source URL, then explicit
 * host/port fields.
 */
function resolveNetworkAddress(
  record: JsonObject,
  lineNumber: number,
  logger: Logger,
): ResolvedNetworkAddress | null {
  const matchedAt = readAddressValue(record["matched-at"], "matched-at", lineNumber, logger);
  if (matchedAt !== null) {
    return {
      host: matchedAt.host,
      port: resolveReportedPort(matchedAt, record, lineNumber, logger),
      fromMatchedAddress: true,
    };
  }

  const url = readAddressValue(record.url, "url", lineNumber, logger);
  if (url !== null) {
    return {
      host: url.host,
      port: resolveReportedPort(url, record, lineNumber, logger),
      fromMatchedAddress: true,
    };
  }

  const hostText = readTextValue(record.host, "host", lineNumber, logger)?.trim();
  if (hostText === undefined) {
    return null;
  }

  const authority = readHostAuthority(hostText, lineNumber, logger);
  if (authority === null) {
    return null;
  }
  // Explicit fields describe the original scan target, not the dialed service.
  // Both describe the same input, so a valid separate port still applies when
  // the embedded port text is malformed.
  return {
    host: authority.host,
    port: authority.port ?? parsePort(record.port, lineNumber, logger),
    fromMatchedAddress: false,
  };
}

/** Falls back to the explicit port field only when the address reported none. */
function resolveReportedPort(
  address: { port: number | undefined; portReported: boolean },
  record: JsonObject,
  lineNumber: number,
  logger: Logger,
): number | undefined {
  if (address.port !== undefined) {
    return address.port;
  }
  return address.portReported ? undefined : parsePort(record.port, lineNumber, logger);
}

function readAddressValue(
  value: unknown,
  field: string,
  lineNumber: number,
  logger: Logger,
): ParsedAddress | null {
  const text = readTextValue(value, field, lineNumber, logger)?.trim();
  if (text === undefined) {
    return null;
  }

  const parsed = parseAddressText(text);
  if (parsed === null) {
    warnUnusable(logger, lineNumber, field);
    return null;
  }
  // Retain a usable host even when the reported port text is malformed.
  if (parsed.portReported && parsed.port === undefined) {
    warnUnusable(logger, lineNumber, "port");
  }
  return parsed;
}

function readWebSocketAddress(
  value: unknown,
  field: string,
  lineNumber: number,
  logger: Logger,
): WebSocketAddress | null {
  const address = readAddressValue(value, field, lineNumber, logger);
  if (address === null) {
    return null;
  }
  if (address.scheme === "ws" || address.scheme === "wss") {
    return { ...address, scheme: address.scheme };
  }
  // Only ws and wss URLs establish a websocket endpoint; anything else falls
  // through to the host/port fallback.
  warnUnusable(logger, lineNumber, field);
  return null;
}

/**
 * Parses a reported address as either a scheme URL or a bare host authority.
 * The scheme check requires `://` so that `host:port` text is never mistaken
 * for a URL scheme.
 */
function parseAddressText(value: string): ParsedAddress | null {
  const text = value.trim();
  if (text.length === 0) {
    return null;
  }

  if (schemeTextPattern.test(text)) {
    let url: URL;
    try {
      url = new URL(text);
    } catch {
      return null;
    }
    // A URL without a host does not establish a network endpoint; for example
    // file:///tmp/result. Fall through to the explicit-field fallbacks.
    if (url.hostname.length === 0) {
      return null;
    }
    // Non-special schemes such as tcp: and ssl: percent-encode international
    // hostnames instead of applying IDNA, so normalize the parsed hostname
    // through the same authority rules as bare hosts.
    const host = normalizeAuthorityHost(url.hostname);
    if (host === null) {
      return null;
    }
    // WHATWG strips default ports from URL.port, so read the authority text
    // instead to preserve an explicitly reported port such as :80 or :443.
    const authority = parseUrlAuthorityPort(text, url.protocol.slice(0, -1).toLowerCase());
    const port = authority?.port ?? (url.port === "" ? undefined : Number(url.port));
    return {
      host,
      port,
      portReported: authority?.portReported ?? url.port !== "",
      scheme: url.protocol.slice(0, -1).toLowerCase(),
      path: url.pathname,
      reportedUrl: text,
    };
  }

  const authority = parseHostAuthority(text);
  if (authority === null) {
    return null;
  }
  return {
    host: authority.host,
    port: authority.port,
    portReported: authority.portReported,
    scheme: undefined,
    path: undefined,
    reportedUrl: undefined,
  };
}

/** WHATWG special schemes treat backslashes as authority terminators. */
const backslashAuthoritySchemes = new Set(["ftp", "file", "http", "https", "ws", "wss"]);

/**
 * Reads the port from the raw authority text of a URL so default ports survive
 * the WHATWG URL parser's normalization.
 */
function parseUrlAuthorityPort(text: string, scheme: string): HostAuthority | null {
  const start = text.indexOf("://") + 3;
  const delimiters = backslashAuthoritySchemes.has(scheme)
    ? ["/", "?", "#", "\\"]
    : ["/", "?", "#"];
  let end = text.length;
  for (const delimiter of delimiters) {
    const index = text.indexOf(delimiter, start);
    if (index !== -1 && index < end) {
      end = index;
    }
  }

  let authorityText = text.slice(start, end);
  const userinfoEnd = authorityText.lastIndexOf("@");
  if (userinfoEnd !== -1) {
    authorityText = authorityText.slice(userinfoEnd + 1);
  }
  return parseHostAuthority(authorityText);
}

function readHttpMethod(
  record: JsonObject,
  lineNumber: number,
  logger: Logger,
): string | undefined {
  const fuzzingMethod = record.fuzzing_method;
  if (fuzzingMethod !== undefined && fuzzingMethod !== null) {
    // For fuzzing results this is the method of the request actually sent.
    const method = readTextValue(fuzzingMethod, "fuzzing_method", lineNumber, logger);
    if (method !== undefined) {
      return method.trim();
    }
  }

  const request = record.request;
  if (typeof request !== "string") {
    return undefined;
  }

  const requestLine = request.split(/\r?\n/u, 1)[0]?.trim() ?? "";
  return /^([A-Za-z]+)[ \t]+\S+[ \t]+HTTP\/\d(?:\.\d+)?$/u.exec(requestLine)?.[1];
}

function readFuzzingComponent(
  record: JsonObject,
  lineNumber: number,
  logger: Logger,
): WebEndpointResource["component"] {
  const position = readTextValue(
    record.fuzzing_position,
    "fuzzing_position",
    lineNumber,
    logger,
  )?.trim();
  const kind =
    position === undefined ? undefined : fuzzingPositionKinds.get(position.toLowerCase());
  // Position values come from Nuclei's fuzz components (query/path/header/
  // cookie/body). Anything else is not an explicit affected component, and
  // matcher labels never establish one either.
  if (kind === undefined) {
    return { kind: WebEndpointComponentKind.Endpoint };
  }

  const parameter = readTextValue(
    record.fuzzing_parameter,
    "fuzzing_parameter",
    lineNumber,
    logger,
  )?.trim();
  return parameter === undefined ? { kind } : { kind, name: parameter };
}

function identifiersForHost(host: string | undefined): AssetIdentifier[] {
  if (host === undefined) {
    return [];
  }
  return canonicalHostIdentifiers(stripHostBrackets(host));
}

function canonicalHostIdentifiers(value: string): AssetIdentifier[] {
  // Classify before canonicalizing: IP literals must not be accepted as DNS
  // names, and DNS normalization rejects addresses anyway.
  const ipAddress = canonicalizeAssetIdentifier(AssetIdentifierType.IpAddress, value);
  if (ipAddress !== null) {
    return [ipAddress];
  }

  const dnsName = canonicalizeAssetIdentifier(AssetIdentifierType.DnsName, value);
  return dnsName === null ? [] : [dnsName];
}

/** WHOIS query shapes that resemble hostnames but carry no DNS identity. */
const asnQueryPattern = /^as\d+$/iu;
const ipv4RangeQueryPattern = /^\d{1,3}(?:\.\d{1,3}){3}\s*-\s*\d{1,3}(?:\.\d{1,3}){3}$/u;

/** Whether a WHOIS query can name a hostname rather than an ASN or a range. */
function isWhoisHostname(value: string): boolean {
  return (
    !value.includes("/") &&
    !asnQueryPattern.test(value) &&
    !ipv4RangeQueryPattern.test(value) &&
    value.includes(".")
  );
}

/**
 * Canonicalizes a WHOIS query subject. WHOIS accepts ASNs, network ranges, and
 * handles that look like hostnames once lowercased, so a DNS identifier is
 * only derived from a dotted domain name; everything else stays source context
 * rather than asset identity.
 */
function identifiersForWhoisSubject(host: string): AssetIdentifier[] {
  // Drop a single trailing root dot so shapes such as "AS15169." cannot slip
  // past the WHOIS guards and canonicalize into a DNS label.
  const value = stripHostBrackets(host).replace(/\.$/u, "");

  if (isWhoisHostname(value)) {
    return canonicalHostIdentifiers(value);
  }

  // IP literals remain valid registration subjects even though IPv6 has no dot.
  const ipAddress = canonicalizeAssetIdentifier(AssetIdentifierType.IpAddress, value);
  return ipAddress === null ? [] : [ipAddress];
}

function reportedIpIdentifier(
  record: JsonObject,
  subjectHost: string | undefined,
  lineNumber: number,
  logger: Logger,
  subjectIsDialedAddress: boolean,
): AssetIdentifier | undefined {
  const reportedIp = readTextValue(record.ip, "ip", lineNumber, logger)?.trim();
  if (reportedIp === undefined) {
    return undefined;
  }

  const ipAddress = canonicalizeAssetIdentifier(AssetIdentifierType.IpAddress, reportedIp);
  if (ipAddress === null) {
    warnUnusable(logger, lineNumber, "ip");
    return undefined;
  }
  if (subjectHost === undefined) {
    return undefined;
  }

  // Compare canonical host spellings, not raw text, so trailing root dots and
  // casing cannot split one subject into two.
  const subject = canonicalHostIdentifier(subjectHost);
  if (subject === null) {
    return undefined;
  }
  if (subject === ipAddress.value.toLowerCase()) {
    return ipAddress;
  }

  // A literal-address subject cannot also be a different address: both
  // identifiers would claim to describe the same subject.
  const literalSubject = canonicalizeAssetIdentifier(
    AssetIdentifierType.IpAddress,
    stripHostBrackets(subjectHost),
  );
  if (literalSubject !== null) {
    return undefined;
  }

  // Protocols that dial the matched address report its IP, so the IP still
  // explains the selected subject when the original input host differs.
  if (subjectIsDialedAddress) {
    return ipAddress;
  }

  // For HTTP, `ip` describes the original scan target. It only explains the
  // selected subject when that subject still resolves to the same host, so a
  // redirect to a different host does not inherit the original target address.
  const originalHost = originalTargetHost(record);
  return originalHost !== null && originalHost === subject ? ipAddress : undefined;
}

/** Canonicalizes a host the way the backend asset-identifier rules would. */
function canonicalHostIdentifier(host: string): string | null {
  const value = stripHostBrackets(host);
  const ipAddress = canonicalizeAssetIdentifier(AssetIdentifierType.IpAddress, value);
  if (ipAddress !== null) {
    return ipAddress.value.toLowerCase();
  }
  const dnsName = canonicalizeAssetIdentifier(AssetIdentifierType.DnsName, value);
  return dnsName === null ? null : dnsName.value.toLowerCase();
}

function originalTargetHost(record: JsonObject): string | null {
  // Prefer the explicit host field; older or partial output may only carry the
  // original target URL, whose hostname serves the same purpose.
  const hostText = typeof record.host === "string" ? record.host.trim() : "";
  if (hostText.length > 0) {
    const authority = parseHostAuthority(hostText);
    if (authority !== null) {
      return canonicalHostIdentifier(authority.host);
    }
  }

  const urlText = typeof record.url === "string" ? record.url.trim() : "";
  const url = parseTargetUrl(urlText.length > 0 ? urlText : undefined);
  return url === null ? null : canonicalHostIdentifier(url.hostname);
}

function canonicalizeAssetIdentifier(
  type: AssetIdentifierType,
  value: string,
): AssetIdentifier | null {
  const parsed = assetIdentifierSchema.safeParse({ type, namespace: null, value });
  return parsed.success ? parsed.data : null;
}

function dedupeIdentifiers(identifiers: AssetIdentifier[]): AssetIdentifier[] {
  // The same address can arrive from both the subject host and the reported IP.
  const seen = new Set<string>();
  return identifiers.filter((identifier) => {
    const key = `${identifier.type}\u0000${identifier.value}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function parseHttpUrl(value: string | undefined): URL | null {
  if (value === undefined || value.length === 0) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  return url.protocol === "http:" || url.protocol === "https:" ? url : null;
}

/** Source URL schemes whose hostname identifies the original scan target. */
const targetUrlSchemes = new Set(["http:", "https:", "ws:", "wss:"]);

function parseTargetUrl(value: string | undefined): URL | null {
  if (value === undefined || value.length === 0) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  return targetUrlSchemes.has(url.protocol) ? url : null;
}

function parsePortText(value: string): number | undefined {
  const text = value.trim();
  if (!/^\d+$/u.test(text)) {
    return undefined;
  }
  const port = Number(text);
  return Number.isInteger(port) && port <= 65535 ? port : undefined;
}

function parsePort(value: unknown, lineNumber: number, logger: Logger): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "number" && typeof value !== "string") {
    warnUnusable(logger, lineNumber, "port");
    return undefined;
  }

  // Parsed as text, not through the URL parser, so an explicit default port
  // such as 80 or 443 is preserved rather than normalized away.
  const port = parsePortText(typeof value === "number" ? String(value) : value);
  if (port === undefined) {
    warnUnusable(logger, lineNumber, "port");
  }
  return port;
}

function stripHostBrackets(value: string): string {
  // WHATWG hostnames keep IPv6 brackets, but identifiers and host comparisons
  // need the bare address.
  return value.startsWith("[") && value.endsWith("]") ? value.slice(1, -1) : value;
}

function readNullableText(
  value: unknown,
  field: string,
  lineNumber: number,
  logger: Logger,
): string | null {
  return readText(value, field, (unusable) => warnUnusable(logger, lineNumber, unusable));
}

function readTextValue(
  value: unknown,
  field: string,
  lineNumber: number,
  logger: Logger,
): string | undefined {
  // Nonblank values are returned verbatim so evidence, references, and target
  // text keep their reported whitespace.
  return (
    readText(value, field, (unusable) => warnUnusable(logger, lineNumber, unusable)) ?? undefined
  );
}

function warnUnusable(logger: Logger, lineNumber: number, field: string) {
  logger.warn({ line: lineNumber, field }, "nuclei: ignoring unusable optional value");
}

function debugSkip(logger: Logger, lineNumber: number, reason: string) {
  logger.debug({ line: lineNumber, reason }, "nuclei: skipping record");
}
