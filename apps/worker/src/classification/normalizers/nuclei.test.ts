import { readFileSync } from "node:fs";

import {
  AffectedResourceType,
  WebEndpointComponentKind,
} from "@exposurenexus/contracts/model/affected-resource";
import { AssetIdentifierType } from "@exposurenexus/contracts/model/asset-identifier";
import { VulnerabilitySeverity } from "@exposurenexus/contracts/model/vulnerability";
import { describe, expect, it, vi } from "vitest";

import { Classifier } from "../classifier.js";
import { NucleiNormalizer } from "./nuclei.js";

import type { ObservationCandidate } from "../classifier.js";
import type { Logger } from "pino";

const normalizer = new NucleiNormalizer();

function createLogger() {
  return { debug: vi.fn(), warn: vi.fn() };
}

async function normalize(source: string) {
  const logger = createLogger();
  const candidates = await normalizer.normalize(
    new TextEncoder().encode(source),
    logger as unknown as Logger,
  );
  return { candidates, logger };
}

function baseRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    "template-id": "example-template",
    info: { name: "Example Detection", severity: "high" },
    type: "http",
    host: "example.com",
    port: "443",
    scheme: "https",
    url: "https://example.com",
    "matched-at": "https://example.com/admin",
    ip: "93.184.216.34",
    timestamp: "2026-01-02T03:04:05+00:00",
    ...overrides,
  };
}

async function normalizeRecord(overrides: Record<string, unknown> = {}) {
  const raw = baseRecord(overrides);
  const { candidates, logger } = await normalize(JSON.stringify(raw));
  return { candidates, logger, raw };
}

function firstCandidate(candidates: ObservationCandidate[]): ObservationCandidate {
  const candidate = candidates[0];
  if (candidate === undefined) {
    throw new Error("expected a candidate");
  }
  return candidate;
}

const juiceshopFixture = readFileSync(
  new URL("./fixtures/juiceshop.nuclei.jsonl", import.meta.url),
  "utf8",
); // The supplied Juice Shop reference scan: 19 HTTP detections against localhost:8080.

describe("NucleiNormalizer file handling", () => {
  it.each(["", "\n", " \r\n\t\n", "\r\n\r\n"])(
    "returns no candidates for blank input %j",
    async (source) => {
      const { candidates, logger } = await normalize(source);

      expect(candidates).toEqual([]);
      expect(logger.debug).not.toHaveBeenCalled();
      expect(logger.warn).not.toHaveBeenCalled();
    },
  );

  it("locates records by physical line, counting blank lines and CRLF endings", async () => {
    const source = [
      "",
      JSON.stringify(baseRecord()),
      "",
      "   ",
      JSON.stringify(baseRecord({ "template-id": "second-template" })),
      "",
    ].join("\r\n");

    const { candidates } = await normalize(source);

    expect(candidates.map((candidate) => candidate.sourceRecord)).toEqual(["line:2", "line:5"]);
  });

  it("preserves source order and duplicate records", async () => {
    const first = JSON.stringify(baseRecord({ "template-id": "one" }));
    const second = JSON.stringify(baseRecord({ "template-id": "two" }));

    const { candidates } = await normalize([first, first, second].join("\n"));

    expect(candidates.map((candidate) => candidate.sourceRecord)).toEqual([
      "line:1",
      "line:2",
      "line:3",
    ]);
    expect(candidates.map((candidate) => candidate.weakness.identifiers.nuclei?.[0])).toEqual([
      "one",
      "one",
      "two",
    ]);
  });

  it("skips matcher failures and reported errors with a line-numbered debug message", async () => {
    const source = [
      JSON.stringify(baseRecord({ "matcher-status": false })),
      JSON.stringify(baseRecord({ error: "connection reset" })),
      JSON.stringify(baseRecord({ "matcher-status": true })),
    ].join("\n");

    const { candidates, logger } = await normalize(source);

    expect(candidates.map((candidate) => candidate.sourceRecord)).toEqual(["line:3"]);
    expect(logger.debug).toHaveBeenCalledWith(
      { line: 1, reason: "matcher-status is false" },
      expect.any(String),
    );
    expect(logger.debug).toHaveBeenCalledWith(
      { line: 2, reason: "error reported" },
      expect.any(String),
    );
  });

  it("treats empty errors and absent matcher status as detections", async () => {
    const { candidates, logger } = await normalize(JSON.stringify(baseRecord({ error: "" })));

    expect(candidates).toHaveLength(1);
    expect(logger.debug).not.toHaveBeenCalled();
  });

  it.each([
    ["malformed JSON", '{"template-id":"x","type":"http"}\n{"broken', /line 2/u],
    ["a non-object record", '"not an object"', /line 1/u],
    ["an array record", "[1,2,3]", /line 1/u],
    ["a missing template-id", JSON.stringify({ type: "http" }), /line 1/u],
    ["a blank template-id", JSON.stringify({ "template-id": "  ", type: "http" }), /line 1/u],
    ["a non-string template-id", JSON.stringify({ "template-id": 7, type: "http" }), /line 1/u],
    ["a missing type", JSON.stringify({ "template-id": "x" }), /line 1/u],
    ["a non-string type", JSON.stringify({ "template-id": "x", type: null }), /line 1/u],
    [
      "an invalid matcher status",
      JSON.stringify({ "template-id": "x", type: "http", "matcher-status": "false" }),
      /line 1/u,
    ],
    [
      "an invalid error field",
      JSON.stringify({ "template-id": "x", type: "http", error: { reason: "x" } }),
      /line 1/u,
    ],
  ])("rejects the whole file for %s", async (_name, source, message) => {
    await expect(normalize(source)).rejects.toThrow(message);
  });

  it("keeps errors log-safe by naming only the line", async () => {
    await expect(
      normalize('{"template-id":"secret-template","type":"http"}\nnot-json-at-all'),
    ).rejects.toThrow(/^nuclei: invalid JSON on line 2$/u);
  });

  it("rejects invalid UTF-8 instead of substituting replacement characters", async () => {
    const line = new TextEncoder().encode(JSON.stringify(baseRecord()));
    const corrupt = new Uint8Array([...line.slice(0, -2), 0xff, ...line.slice(-2)]);
    await expect(
      normalizer.normalize(corrupt, createLogger() as unknown as Logger),
    ).rejects.toThrow(/^nuclei: invalid UTF-8$/u);
  });

  it("accepts an empty protocol string and unknown protocol names", async () => {
    const { candidates } = await normalize(
      [
        JSON.stringify({ "template-id": "offline", type: "" }),
        JSON.stringify({ "template-id": "future", type: "some-future-protocol" }),
      ].join("\n"),
    );

    expect(candidates).toHaveLength(2);
    expect(candidates[0]?.affectedResource).toEqual({ type: AffectedResourceType.Unspecified });
    expect(candidates[1]?.affectedResource).toEqual({ type: AffectedResourceType.Unspecified });
  });
});

describe("NucleiNormalizer candidate content", () => {
  it("maps descriptive fields and the reported timestamp", async () => {
    const { candidates } = await normalizeRecord({
      info: {
        name: "Exposed Admin",
        description: "Administrative interface is reachable",
        remediation: "Restrict access to internal networks",
        severity: "HIGH",
      },
      timestamp: "2026-01-02T03:04:05.123456789+00:00",
    });
    const candidate = firstCandidate(candidates);

    expect(candidate.source).toBe("nuclei");
    expect(candidate.title).toBe("Exposed Admin");
    expect(candidate.description).toBe("Administrative interface is reachable");
    expect(candidate.remediation).toBe("Restrict access to internal networks");
    expect(candidate.severity).toBe(VulnerabilitySeverity.High);
    expect(candidate.observedAt?.toISOString()).toBe("2026-01-02T03:04:05.123Z");
    expect(candidate.weakness.identifiers).toEqual({ nuclei: ["example-template"] });
  });

  it.each([
    [
      { info: { name: "FingerprintHub Technology Fingerprint" }, "matcher-name": "qm-system" },
      "FingerprintHub Technology Fingerprint (qm-system)",
    ],
    [{ info: { name: "QM-System detection" }, "matcher-name": "qm-system" }, "QM-System detection"],
    [
      { info: {}, "matcher-name": "cross-origin-resource-policy" },
      "example-template (cross-origin-resource-policy)",
    ],
    [{ info: { name: "Plain" }, "matcher-name": "   " }, "Plain"],
  ])("builds title %#", async (overrides, expected) => {
    const { candidates } = await normalizeRecord(overrides);

    expect(firstCandidate(candidates).title).toBe(expected);
  });

  it("warns and falls back when the title name is unusable", async () => {
    const { candidates, logger } = await normalizeRecord({ info: { name: 42 } });

    expect(firstCandidate(candidates).title).toBe("example-template");
    expect(logger.warn).toHaveBeenCalledWith(
      { line: 1, field: "name" },
      expect.stringContaining("nuclei"),
    );
  });

  it("uses null description and remediation when missing or unusable", async () => {
    const missing = await normalizeRecord({ info: { name: "Bare" } });
    expect(firstCandidate(missing.candidates).description).toBeNull();
    expect(firstCandidate(missing.candidates).remediation).toBeNull();

    const unusable = await normalizeRecord({ info: { description: 7 } });
    expect(firstCandidate(unusable.candidates).description).toBeNull();
    expect(unusable.logger.warn).toHaveBeenCalledWith(
      { line: 1, field: "description" },
      expect.any(String),
    );
  });

  it.each([
    ["critical", VulnerabilitySeverity.Critical],
    ["high", VulnerabilitySeverity.High],
    ["medium", VulnerabilitySeverity.Medium],
    ["low", VulnerabilitySeverity.Low],
    ["info", VulnerabilitySeverity.Info],
    ["unknown", VulnerabilitySeverity.Info],
    ["not-a-severity", VulnerabilitySeverity.Info],
  ])("maps reported severity %s", async (severity, expected) => {
    const { candidates } = await normalizeRecord({ info: { severity } });

    expect(firstCandidate(candidates).severity).toBe(expected);
  });

  it("warns about unknown severity and missing severity without warning", async () => {
    const unknown = await normalizeRecord({ info: { severity: "catastrophic" } });
    expect(unknown.logger.warn).toHaveBeenCalledWith(
      { line: 1, field: "severity" },
      expect.any(String),
    );

    const missing = await normalizeRecord({ info: { name: "No severity" } });
    expect(firstCandidate(missing.candidates).severity).toBe(VulnerabilitySeverity.Info);
    expect(missing.logger.warn).not.toHaveBeenCalled();
  });

  it.each(["not-a-timestamp", "1", "May 5", "2024-02-30T00:00:00Z", "2024-01-01 00:00:00"])(
    "maps the non-RFC 3339 timestamp %j to null without substituting another time",
    async (timestamp) => {
      const invalid = await normalizeRecord({ timestamp });
      expect(firstCandidate(invalid.candidates).observedAt).toBeNull();
      expect(invalid.logger.warn).toHaveBeenCalledWith(
        { line: 1, field: "timestamp" },
        expect.any(String),
      );
    },
  );

  it("maps missing timestamps to null without substituting the current time", async () => {
    const missing = await normalizeRecord({ timestamp: undefined });
    expect(firstCandidate(missing.candidates).observedAt).toBeNull();
    expect(missing.logger.warn).not.toHaveBeenCalled();
  });

  it("renders labeled evidence sections and preserves source whitespace", async () => {
    const request = "GET /admin HTTP/1.1\r\nHost: example.com\r\n\r\n";
    const response = "HTTP/1.1 200 OK\r\n\r\nbody text\n";
    const { candidates } = await normalizeRecord({
      request,
      response,
      "extracted-results": ["admin", "  spaced value  "],
      "curl-command": "curl -X 'GET' 'https://example.com/admin'",
    });
    const evidence = firstCandidate(candidates).evidence ?? "";

    expect(evidence).toContain("<summary>Request</summary>");
    expect(evidence).toContain(request);
    expect(evidence).toContain("<summary>Response</summary>");
    expect(evidence).toContain(response);
    expect(evidence).toContain("<summary>Extracted Results</summary>");
    expect(evidence).toContain("admin\n  spaced value  ");
    expect(evidence).toContain("<summary>Reproduction</summary>");
    expect(evidence).toContain("curl -X 'GET' 'https://example.com/admin'");
  });

  it("omits empty evidence sections and returns null when nothing is available", async () => {
    const { candidates } = await normalizeRecord({
      request: "",
      response: null,
      "curl-command": "   ",
      "extracted-results": [],
    });

    expect(firstCandidate(candidates).evidence).toBeNull();
  });

  it("warns and omits unusable evidence values", async () => {
    const { candidates, logger } = await normalizeRecord({
      request: 42,
      "extracted-results": 7,
    });

    expect(firstCandidate(candidates).evidence).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith({ line: 1, field: "request" }, expect.any(String));
    expect(logger.warn).toHaveBeenCalledWith(
      { line: 1, field: "extracted-results" },
      expect.any(String),
    );
  });

  it("maps reported CVE and CWE identifiers from scalar, array, and null shapes", async () => {
    const { candidates } = await normalizeRecord({
      info: {
        classification: {
          "cve-id": "cve-2021-44228",
          "cwe-id": ["cwe-502", 42, "CWE-20"],
        },
      },
    });

    expect(firstCandidate(candidates).weakness.identifiers).toEqual({
      nuclei: ["example-template"],
      cve: ["CVE-2021-44228"],
      cwe: ["CWE-20", "CWE-502"],
    });
  });

  it("retains valid optional identifiers and warns about the bad ones individually", async () => {
    const { candidates, logger } = await normalizeRecord({
      info: {
        classification: {
          "cve-id": ["CVE-2021-44228", "not-a-cve"],
          "cwe-id": null,
        },
      },
    });

    expect(firstCandidate(candidates).weakness.identifiers).toEqual({
      nuclei: ["example-template"],
      cve: ["CVE-2021-44228"],
    });
    expect(logger.warn).toHaveBeenCalledWith(
      { line: 1, field: "cve-id" },
      expect.stringContaining("nuclei"),
    );
    expect(candidates[0]?.sourceMetadata).toMatchObject({
      info: { classification: { "cve-id": ["CVE-2021-44228", "not-a-cve"], "cwe-id": null } },
    });
  });

  it("adds a nuclei-matcher identifier when a matcher name is present", async () => {
    const { candidates } = await normalizeRecord({
      "matcher-name": "cross-origin-resource-policy",
    });

    expect(firstCandidate(candidates).weakness.identifiers["nuclei-matcher"]).toEqual([
      "example-template:cross-origin-resource-policy",
    ]);
  });

  it("treats extractor names as source context rather than weakness identifiers", async () => {
    const { candidates } = await normalizeRecord({ "extractor-name": "endpoints" });

    expect(firstCandidate(candidates).weakness.identifiers).toEqual({
      nuclei: ["example-template"],
    });
    expect(candidates[0]?.sourceMetadata["extractor-name"]).toBe("endpoints");
  });

  it("deduplicates exact references while preserving text, casing, and order", async () => {
    const { candidates } = await normalizeRecord({
      info: {
        reference: [
          "https://Example.com/a",
          "https://Example.com/a",
          "https://example.com/a",
          "https://example.com/b",
        ],
      },
    });

    expect(firstCandidate(candidates).weakness.references).toEqual([
      "https://Example.com/a",
      "https://example.com/a",
      "https://example.com/b",
    ]);
  });

  it("accepts scalar and null reference shapes", async () => {
    const scalar = await normalizeRecord({ info: { reference: "https://example.com/a" } });
    expect(firstCandidate(scalar.candidates).weakness.references).toEqual([
      "https://example.com/a",
    ]);

    const absent = await normalizeRecord({ info: { reference: null } });
    expect("references" in firstCandidate(absent.candidates).weakness).toBe(false);
  });

  it("warns and drops unusable references without discarding the candidate", async () => {
    const { candidates, logger } = await normalizeRecord({
      info: { reference: ["https://example.com/a", 42] },
    });

    expect(firstCandidate(candidates).weakness.references).toEqual(["https://example.com/a"]);
    expect(logger.warn).toHaveBeenCalledWith({ line: 1, field: "reference" }, expect.any(String));
  });

  it("maps CVSS score and vector with a version derived from the vector", async () => {
    const { candidates } = await normalizeRecord({
      info: {
        classification: {
          "cvss-score": 5.3,
          "cvss-metrics": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N",
        },
      },
    });

    expect(firstCandidate(candidates).weakness.cvss).toEqual([
      {
        score: 5.3,
        vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N",
        version: "3.1",
      },
    ]);
  });

  it("supports score-only and vector-only assessments", async () => {
    const scoreOnly = await normalizeRecord({
      info: { classification: { "cvss-score": 9.8 } },
    });
    expect(firstCandidate(scoreOnly.candidates).weakness.cvss).toEqual([{ score: 9.8 }]);

    const vectorOnly = await normalizeRecord({
      info: { classification: { "cvss-metrics": "3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H" } },
    });
    expect(firstCandidate(vectorOnly.candidates).weakness.cvss).toEqual([
      { vector: "3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H", version: "3.1" },
    ]);

    const versionless = await normalizeRecord({
      info: { classification: { "cvss-metrics": "AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H" } },
    });
    expect(firstCandidate(versionless.candidates).weakness.cvss).toEqual([
      { vector: "AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H" },
    ]);
  });

  it("keeps a valid vector when the score is out of range and warns", async () => {
    const { candidates, logger } = await normalizeRecord({
      info: {
        classification: {
          "cvss-score": 11,
          "cvss-metrics": "CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H",
        },
      },
    });

    expect(firstCandidate(candidates).weakness.cvss).toEqual([
      { vector: "CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H", version: "4.0" },
    ]);
    expect(logger.warn).toHaveBeenCalledWith({ line: 1, field: "cvss-score" }, expect.any(String));
  });

  it("preserves reported zero scores and never invents unreported zeros", async () => {
    const zero = await normalizeRecord({
      info: {
        classification: { "cvss-score": 0, "epss-score": 0, "epss-percentile": 0 },
      },
    });
    expect(firstCandidate(zero.candidates).weakness.cvss).toEqual([{ score: 0 }]);
    expect(firstCandidate(zero.candidates).weakness.epss).toEqual({ score: 0, percentile: 0 });

    const absent = await normalizeRecord({ info: { name: "No scoring" } });
    expect(firstCandidate(absent.candidates).weakness).toEqual({
      identifiers: { nuclei: ["example-template"] },
    });
  });

  it("supports partial EPSS data and drops out-of-range values with a warning", async () => {
    const partial = await normalizeRecord({
      info: { classification: { "epss-score": 0.42 } },
    });
    expect(firstCandidate(partial.candidates).weakness.epss).toEqual({ score: 0.42 });

    const outOfRange = await normalizeRecord({
      info: { classification: { "epss-percentile": 1.5 } },
    });
    expect("epss" in firstCandidate(outOfRange.candidates).weakness).toBe(false);
    expect(outOfRange.logger.warn).toHaveBeenCalledWith(
      { line: 1, field: "epss-percentile" },
      expect.any(String),
    );
  });

  it("preserves unmapped source fields under their original names and nesting", async () => {
    const raw = baseRecord({
      template: "http/miscellaneous/example.yaml",
      "template-path": "/home/user/nuclei-templates/http/miscellaneous/example.yaml",
      "matcher-name": "strong",
      "extractor-name": "tokens",
      meta: { paths: "/admin" },
      "unknown-field": { nested: [1, 2, 3] },
      issue_trackers: { github: { id: 5, url: "https://example.com/1" } },
      "matched-line": [3, 9],
      interaction: { protocol: "dns", raw: "interaction-data" },
      info: {
        name: "Example Detection",
        author: ["analyst"],
        tags: ["exposure", "api"],
        metadata: { "max-request": 2, verified: true },
        classification: { "cve-id": "CVE-2021-44228", cpe: "cpe:/a:vendor:product:1.0" },
      },
    });

    const { candidates } = await normalize(JSON.stringify(raw));
    const candidate = firstCandidate(candidates);

    expect(candidate.sourceMetadata).toEqual(raw);
    expect(candidate.sourceMetadata.meta).toEqual({ paths: "/admin" });
    expect(candidate.sourceMetadata.info).toMatchObject({
      metadata: { "max-request": 2, verified: true },
    });
  });

  it("retains unusable optional values in source metadata with individual warnings", async () => {
    const raw = baseRecord({
      info: {
        name: 42,
        description: 7,
        severity: "catastrophic",
        classification: { "cve-id": 7, "cvss-score": 50 },
      },
      timestamp: "not-a-time",
      ip: "not-an-ip",
    });

    const { candidates, logger } = await normalize(JSON.stringify(raw));
    const candidate = firstCandidate(candidates);

    expect(candidates).toHaveLength(1);
    expect(candidate.title).toBe("example-template");
    expect(candidate.description).toBeNull();
    expect(candidate.severity).toBe(VulnerabilitySeverity.Info);
    expect(candidate.observedAt).toBeNull();
    expect(candidate.weakness).toEqual({ identifiers: { nuclei: ["example-template"] } });
    expect(candidate.assetIdentifierCandidates).toEqual([
      { type: AssetIdentifierType.DnsName, namespace: null, value: "example.com" },
    ]);
    expect(candidate.sourceMetadata).toEqual(raw);
    for (const field of [
      "name",
      "description",
      "severity",
      "cve-id",
      "cvss-score",
      "timestamp",
      "ip",
    ]) {
      expect(logger.warn).toHaveBeenCalledWith(
        { line: 1, field },
        expect.stringContaining("nuclei"),
      );
    }
  });
});

describe("NucleiNormalizer HTTP and headless subject mapping", () => {
  it("prefers a usable matched-at URL as the affected subject and endpoint", async () => {
    const { candidates } = await normalizeRecord({
      host: "origin.example.com",
      url: "http://origin.example.com/",
      "matched-at": "https://cdn.example.net:8443/a%20b?x=1#frag",
      ip: "203.0.113.10",
    });
    const candidate = firstCandidate(candidates);

    expect(candidate.affectedResource).toEqual({
      type: AffectedResourceType.WebEndpoint,
      scheme: "https",
      host: "cdn.example.net",
      port: 8443,
      path: "/a%20b",
      component: { kind: WebEndpointComponentKind.Endpoint },
      reportedUrl: "https://cdn.example.net:8443/a%20b?x=1#frag",
    });
    expect(candidate.assetIdentifierCandidates).toEqual([
      { type: AssetIdentifierType.DnsName, namespace: null, value: "cdn.example.net" },
    ]);
  });

  it("materializes standard default ports and a root path", async () => {
    const https = await normalizeRecord({ "matched-at": "https://example.com" });
    expect(firstCandidate(https.candidates).affectedResource).toMatchObject({
      scheme: "https",
      host: "example.com",
      port: 443,
      path: "/",
    });

    const http = await normalizeRecord({ "matched-at": "http://example.com" });
    expect(firstCandidate(http.candidates).affectedResource).toMatchObject({
      scheme: "http",
      port: 80,
    });
  });

  it("falls back to the reported url when matched-at is not an HTTP(S) URL", async () => {
    const { candidates } = await normalizeRecord({
      "matched-at": "/tmp/nuclei-response.html",
      host: undefined,
      url: "http://fallback.example.com:8080/base?q=1",
      ip: undefined,
    });
    const candidate = firstCandidate(candidates);

    expect(candidate.affectedResource).toMatchObject({
      scheme: "http",
      host: "fallback.example.com",
      port: 8080,
      path: "/base",
      reportedUrl: "http://fallback.example.com:8080/base?q=1",
    });
    expect(candidate.assetIdentifierCandidates).toEqual([
      { type: AssetIdentifierType.DnsName, namespace: null, value: "fallback.example.com" },
    ]);
  });

  it("falls back to explicit host, scheme, port, and path fields", async () => {
    const { candidates } = await normalizeRecord({
      "matched-at": undefined,
      url: undefined,
      scheme: "https",
      host: "api.example.com",
      port: "8443",
      path: "/headers",
      ip: undefined,
    });
    const candidate = firstCandidate(candidates);
    const resource = candidate.affectedResource;
    if (resource.type !== AffectedResourceType.WebEndpoint) {
      throw new Error("expected a web endpoint");
    }

    expect(resource).toMatchObject({
      scheme: "https",
      host: "api.example.com",
      port: 8443,
      path: "/headers",
    });
    expect("reportedUrl" in resource).toBe(false);
    expect(candidate.assetIdentifierCandidates).toEqual([
      { type: AssetIdentifierType.DnsName, namespace: null, value: "api.example.com" },
    ]);
  });

  it("extracts a host and port embedded in the explicit host field", async () => {
    const { candidates } = await normalizeRecord({
      "matched-at": undefined,
      url: undefined,
      scheme: "http",
      host: "localhost:8080",
      port: undefined,
      path: "/",
      ip: undefined,
    });

    expect(firstCandidate(candidates).affectedResource).toMatchObject({
      host: "localhost",
      port: 8080,
    });
  });

  it("keeps the explicit host independent of path contents", async () => {
    const relativePath = await normalizeRecord({
      "matched-at": undefined,
      url: undefined,
      scheme: "https",
      host: "example.com",
      port: undefined,
      path: "admin",
      ip: undefined,
    });
    const relative = firstCandidate(relativePath.candidates);
    expect(relative.affectedResource).toMatchObject({
      scheme: "https",
      host: "example.com",
      port: 443,
      path: "/admin",
    });
    expect(relative.assetIdentifierCandidates).toEqual([
      { type: AssetIdentifierType.DnsName, namespace: null, value: "example.com" },
    ]);

    const userinfoPath = await normalizeRecord({
      "matched-at": undefined,
      url: undefined,
      scheme: "https",
      host: "example.com",
      port: undefined,
      path: "@other.example/admin",
      ip: undefined,
    });
    const userinfo = firstCandidate(userinfoPath.candidates);
    expect(userinfo.affectedResource).toMatchObject({
      scheme: "https",
      host: "example.com",
      path: "/@other.example/admin",
    });
    expect(userinfo.assetIdentifierCandidates).toEqual([
      { type: AssetIdentifierType.DnsName, namespace: null, value: "example.com" },
    ]);
  });

  it("rejects explicit host text carrying userinfo or path characters", async () => {
    const { candidates, logger } = await normalizeRecord({
      "matched-at": undefined,
      url: undefined,
      scheme: "https",
      host: "example.com@evil.example",
      port: undefined,
      path: undefined,
      ip: undefined,
    });

    expect(firstCandidate(candidates).affectedResource).toEqual({
      type: AffectedResourceType.Unspecified,
    });
    expect(firstCandidate(candidates).assetIdentifierCandidates).toEqual([]);
    expect(logger.warn).toHaveBeenCalledWith({ line: 1, field: "host" }, expect.any(String));
  });

  it.each([
    ["2001:db8::1", "8443", "[2001:db8::1]"],
    ["[2001:db8::1]:8443", undefined, "[2001:db8::1]"],
  ])("parses explicit IPv6 host %s", async (host, port, expectedHost) => {
    const { candidates } = await normalizeRecord({
      "matched-at": undefined,
      url: undefined,
      scheme: "https",
      host,
      port,
      path: "/admin",
      ip: undefined,
    });
    const candidate = firstCandidate(candidates);

    expect(candidate.affectedResource).toMatchObject({
      scheme: "https",
      host: expectedHost,
      port: 8443,
      path: "/admin",
    });
    expect(candidate.assetIdentifierCandidates).toEqual([
      { type: AssetIdentifierType.IpAddress, namespace: null, value: "2001:db8::1" },
    ]);
  });

  it("keeps an embedded explicit port and the known scheme without doubling them", async () => {
    const { candidates } = await normalizeRecord({
      "matched-at": undefined,
      url: undefined,
      scheme: "https",
      host: "example.com:8443",
      port: "8443",
      path: "/admin",
      ip: undefined,
    });

    expect(firstCandidate(candidates).affectedResource).toMatchObject({
      scheme: "https",
      host: "example.com",
      port: 8443,
      path: "/admin",
    });
  });

  it("preserves an explicit default port on a scheme-less host", async () => {
    const { candidates } = await normalizeRecord({
      "matched-at": undefined,
      url: undefined,
      scheme: undefined,
      host: "example.com:80",
      port: undefined,
      path: undefined,
      ip: undefined,
    });
    const resource = firstCandidate(candidates).affectedResource;
    if (resource.type !== AffectedResourceType.WebEndpoint) {
      throw new Error("expected a web endpoint");
    }

    expect(resource).toMatchObject({ host: "example.com", port: 80 });
    expect("scheme" in resource).toBe(false);
  });

  it("includes the reported IP when it belongs to the selected subject", async () => {
    const { candidates } = await normalizeRecord({
      host: "EXAMPLE.com",
      "matched-at": "https://example.com/admin",
      ip: "93.184.216.34",
    });

    expect(firstCandidate(candidates).assetIdentifierCandidates).toEqual([
      { type: AssetIdentifierType.DnsName, namespace: null, value: "example.com" },
      { type: AssetIdentifierType.IpAddress, namespace: null, value: "93.184.216.34" },
    ]);
  });

  it("treats a trailing root dot as the same subject when attributing the reported IP", async () => {
    const { candidates } = await normalizeRecord({
      host: "example.com.",
      "matched-at": "https://example.com/admin",
      ip: "203.0.113.10",
    });

    expect(firstCandidate(candidates).assetIdentifierCandidates).toEqual([
      { type: AssetIdentifierType.DnsName, namespace: null, value: "example.com" },
      { type: AssetIdentifierType.IpAddress, namespace: null, value: "203.0.113.10" },
    ]);
  });

  it("excludes the original target IP when a redirect matched a different host", async () => {
    const { candidates } = await normalizeRecord({
      host: "example.com",
      "matched-at": "https://www.example.org/login",
      ip: "93.184.216.34",
    });
    const candidate = firstCandidate(candidates);

    expect(candidate.assetIdentifierCandidates).toEqual([
      { type: AssetIdentifierType.DnsName, namespace: null, value: "www.example.org" },
    ]);
    expect(candidate.sourceMetadata).toMatchObject({
      host: "example.com",
      ip: "93.184.216.34",
      "matched-at": "https://www.example.org/login",
    });
  });

  it("associates the reported IP with the url host when the host field is absent", async () => {
    const { candidates } = await normalizeRecord({
      host: undefined,
      url: "https://example.com",
      "matched-at": "https://example.com/login",
      ip: "93.184.216.34",
    });

    expect(firstCandidate(candidates).assetIdentifierCandidates).toEqual([
      { type: AssetIdentifierType.DnsName, namespace: null, value: "example.com" },
      { type: AssetIdentifierType.IpAddress, namespace: null, value: "93.184.216.34" },
    ]);
  });

  it("excludes a reported IP when no original target host establishes the association", async () => {
    const { candidates } = await normalizeRecord({
      host: undefined,
      url: undefined,
      "matched-at": "https://example.com/login",
      ip: "93.184.216.34",
    });

    expect(firstCandidate(candidates).assetIdentifierCandidates).toEqual([
      { type: AssetIdentifierType.DnsName, namespace: null, value: "example.com" },
    ]);
  });

  it("warns and falls back when the template info block is not an object", async () => {
    const { candidates, logger } = await normalizeRecord({ info: "not-an-object" });

    expect(firstCandidate(candidates).title).toBe("example-template");
    expect(firstCandidate(candidates).severity).toBe(VulnerabilitySeverity.Info);
    expect(logger.warn).toHaveBeenCalledWith({ line: 1, field: "info" }, expect.any(String));
  });

  it("deduplicates the reported IP when the subject is that address", async () => {
    const { candidates } = await normalizeRecord({
      host: "127.0.0.1",
      url: "http://127.0.0.1:8080/",
      "matched-at": "http://127.0.0.1:8080/",
      scheme: "http",
      port: "8080",
      ip: "127.0.0.1",
    });

    expect(firstCandidate(candidates).assetIdentifierCandidates).toEqual([
      { type: AssetIdentifierType.IpAddress, namespace: null, value: "127.0.0.1" },
    ]);
  });

  it("extracts canonical IPv6 identifiers from bracketed URLs", async () => {
    const { candidates } = await normalizeRecord({
      host: "[2001:db8::1]",
      url: "http://[2001:db8::1]:8443/x",
      "matched-at": "http://[2001:db8::1]:8443/x",
      ip: "2001:db8::1",
    });

    expect(firstCandidate(candidates).affectedResource).toMatchObject({
      host: "[2001:db8::1]",
      port: 8443,
    });
    expect(firstCandidate(candidates).assetIdentifierCandidates).toEqual([
      { type: AssetIdentifierType.IpAddress, namespace: null, value: "2001:db8::1" },
    ]);
  });

  it("warns about an unusable reported IP but keeps the detection", async () => {
    const { candidates, logger } = await normalizeRecord({ ip: "not-an-ip" });

    expect(firstCandidate(candidates).assetIdentifierCandidates).toEqual([
      { type: AssetIdentifierType.DnsName, namespace: null, value: "example.com" },
    ]);
    expect(logger.warn).toHaveBeenCalledWith({ line: 1, field: "ip" }, expect.any(String));
  });

  it("obtains the HTTP method from fuzzing data or a usable request line", async () => {
    const requestLine = await normalizeRecord({
      request: "POST /admin HTTP/1.1\r\nHost: example.com\r\n\r\n",
    });
    expect(firstCandidate(requestLine.candidates).affectedResource).toMatchObject({
      method: "POST",
    });

    const fuzzing = await normalizeRecord({
      request: "POST /admin HTTP/1.1\r\nHost: example.com\r\n\r\n",
      fuzzing_method: "PUT",
    });
    expect(firstCandidate(fuzzing.candidates).affectedResource).toMatchObject({ method: "PUT" });

    const headless = await normalizeRecord({ request: undefined });
    expect(firstCandidate(headless.candidates).affectedResource).not.toHaveProperty("method");
  });

  it.each([
    ["query", "id", WebEndpointComponentKind.QueryParameter],
    ["path", "slug", WebEndpointComponentKind.PathParameter],
    ["header", "X-Api-Key", WebEndpointComponentKind.Header],
    ["cookie", "session", WebEndpointComponentKind.Cookie],
    ["body", "user[email]", WebEndpointComponentKind.BodyField],
  ])("maps fuzzing position %s to a %s component", async (position, parameter, kind) => {
    const { candidates } = await normalizeRecord({
      fuzzing_position: position,
      fuzzing_parameter: parameter,
    });

    expect(firstCandidate(candidates).affectedResource).toMatchObject({
      component: { kind, name: parameter },
    });
  });

  it("keeps the mapped component kind when no fuzzing parameter is reported", async () => {
    const { candidates } = await normalizeRecord({ fuzzing_position: "query" });

    expect(firstCandidate(candidates).affectedResource).toMatchObject({
      component: { kind: WebEndpointComponentKind.QueryParameter },
    });
  });

  it.each([
    [{ fuzzing_position: "raw", fuzzing_parameter: "payload" }],
    [{ fuzzing_position: "unknown-position" }],
    [{ "matcher-name": "cross-origin-resource-policy" }],
  ])("uses the endpoint component without explicit fuzzing data %#", async (overrides) => {
    const { candidates } = await normalizeRecord(overrides);

    expect(firstCandidate(candidates).affectedResource).toMatchObject({
      component: { kind: WebEndpointComponentKind.Endpoint },
    });
  });

  it("maps headless detections without requests or IPs", async () => {
    const { candidates } = await normalizeRecord({
      type: "headless",
      host: "shop.example.com",
      url: "https://shop.example.com/",
      "matched-at": "https://shop.example.com/product/1",
      request: undefined,
      response: undefined,
      "curl-command": undefined,
      ip: undefined,
    });
    const candidate = firstCandidate(candidates);

    expect(candidate.affectedResource).toEqual({
      type: AffectedResourceType.WebEndpoint,
      scheme: "https",
      host: "shop.example.com",
      port: 443,
      path: "/product/1",
      component: { kind: WebEndpointComponentKind.Endpoint },
      reportedUrl: "https://shop.example.com/product/1",
    });
    expect(candidate.evidence).toBeNull();
    expect(candidate.assetIdentifierCandidates).toEqual([
      { type: AssetIdentifierType.DnsName, namespace: null, value: "shop.example.com" },
    ]);
  });

  it.each(["file", "code", ""])(
    "keeps a %s detection with an unspecified resource and no inferred identifiers",
    async (type) => {
      const { candidates } = await normalizeRecord({
        type,
        host: "db.example.com",
        ip: "203.0.113.5",
        "matched-at": "tcp://db.example.com:5432",
      });
      const candidate = firstCandidate(candidates);

      expect(candidate.affectedResource).toEqual({ type: AffectedResourceType.Unspecified });
      expect(candidate.assetIdentifierCandidates).toEqual([]);
      expect(candidate.weakness.identifiers).toEqual({ nuclei: ["example-template"] });
      expect(candidate.sourceMetadata).toMatchObject({ type, ip: "203.0.113.5" });
    },
  );
});

describe("NucleiNormalizer network-oriented subject mapping", () => {
  it("maps a tcp matched address to a TCP network service", async () => {
    const { candidates } = await normalizeRecord({
      type: "tcp",
      host: "db.example.com",
      port: "5432",
      scheme: undefined,
      url: undefined,
      "matched-at": "db.example.com:5432",
      ip: "203.0.113.5",
    });
    const candidate = firstCandidate(candidates);

    expect(candidate.affectedResource).toEqual({
      type: AffectedResourceType.NetworkService,
      host: "db.example.com",
      port: 5432,
      transport: "tcp",
    });
    expect(candidate.affectedResource).not.toHaveProperty("protocol");
    expect(candidate.assetIdentifierCandidates).toEqual([
      { type: AssetIdentifierType.DnsName, namespace: null, value: "db.example.com" },
      { type: AssetIdentifierType.IpAddress, namespace: null, value: "203.0.113.5" },
    ]);
  });

  it("prefers the dialed tcp port over the original input port", async () => {
    const { candidates } = await normalizeRecord({
      type: "tcp",
      host: "db.example.com",
      port: "80",
      url: undefined,
      "matched-at": "db.example.com:6379",
      ip: undefined,
    });
    const candidate = firstCandidate(candidates);

    expect(candidate.affectedResource).toEqual({
      type: AffectedResourceType.NetworkService,
      host: "db.example.com",
      port: 6379,
      transport: "tcp",
    });
    expect(candidate.sourceMetadata).toMatchObject({ host: "db.example.com", port: "80" });
  });

  it("preserves an explicitly reported default port in a tcp matched URL", async () => {
    const { candidates } = await normalizeRecord({
      type: "tcp",
      host: "matched.example",
      port: "22",
      url: undefined,
      "matched-at": "http://matched.example:80/",
      ip: undefined,
    });

    expect(firstCandidate(candidates).affectedResource).toEqual({
      type: AffectedResourceType.NetworkService,
      host: "matched.example",
      port: 80,
      transport: "tcp",
    });
  });

  it("canonicalizes internationalized hosts from custom-scheme tcp URLs", async () => {
    const fromUrl = await normalizeRecord({
      type: "tcp",
      host: undefined,
      port: undefined,
      scheme: undefined,
      url: undefined,
      "matched-at": "tcp://bücher.example:5432",
      ip: undefined,
    });
    const fromAuthority = await normalizeRecord({
      type: "tcp",
      host: "bücher.example:5432",
      port: undefined,
      scheme: undefined,
      url: undefined,
      "matched-at": undefined,
      ip: undefined,
    });
    const expected = {
      type: AffectedResourceType.NetworkService,
      host: "xn--bcher-kva.example",
      port: 5432,
      transport: "tcp",
    };

    expect(firstCandidate(fromUrl.candidates).affectedResource).toEqual(expected);
    expect(firstCandidate(fromAuthority.candidates).affectedResource).toEqual(expected);
    expect(firstCandidate(fromUrl.candidates).assetIdentifierCandidates).toEqual([
      { type: AssetIdentifierType.DnsName, namespace: null, value: "xn--bcher-kva.example" },
    ]);
  });

  it("rejects a hostless tcp matched URL and uses the host and port fallbacks", async () => {
    const { candidates, logger } = await normalizeRecord({
      type: "tcp",
      host: "db.example",
      port: "5432",
      url: undefined,
      "matched-at": "file:///tmp/result",
      ip: undefined,
    });

    expect(firstCandidate(candidates).affectedResource).toEqual({
      type: AffectedResourceType.NetworkService,
      host: "db.example",
      port: 5432,
      transport: "tcp",
    });
    expect(logger.warn).toHaveBeenCalledWith(
      { line: 1, field: "matched-at" },
      expect.stringContaining("nuclei"),
    );
  });

  it.each([
    [
      "tcp",
      {
        type: AffectedResourceType.NetworkService,
        host: "db.example",
        port: 5432,
        transport: "tcp",
      },
    ],
    [
      "ssl",
      {
        type: AffectedResourceType.NetworkService,
        host: "db.example",
        port: 5432,
        transport: "tcp",
        protocol: "tls",
      },
    ],
    ["javascript", { type: AffectedResourceType.NetworkService, host: "db.example", port: 5432 }],
  ])(
    "uses a valid explicit port when the %s host's embedded port is malformed",
    async (type, expected) => {
      const { candidates, logger } = await normalizeRecord({
        type,
        host: "db.example:bad",
        port: "5432",
        scheme: undefined,
        url: undefined,
        "matched-at": undefined,
        ip: undefined,
      });

      expect(firstCandidate(candidates).affectedResource).toEqual(expected);
      expect(logger.warn).toHaveBeenCalledWith(
        { line: 1, field: "port" },
        expect.stringContaining("nuclei"),
      );
    },
  );

  it("excludes a conflicting reported IP when the tcp subject is an IP literal", async () => {
    const { candidates } = await normalizeRecord({
      type: "tcp",
      host: "10.0.0.5",
      port: "2222",
      url: undefined,
      "matched-at": "10.0.0.5:2222",
      ip: "198.51.100.20",
    });
    const candidate = firstCandidate(candidates);

    expect(candidate.affectedResource).toEqual({
      type: AffectedResourceType.NetworkService,
      host: "10.0.0.5",
      port: 2222,
      transport: "tcp",
    });
    // A literal-address subject cannot also be a different address, so the
    // conflicting report stays in metadata only.
    expect(candidate.assetIdentifierCandidates).toEqual([
      { type: AssetIdentifierType.IpAddress, namespace: null, value: "10.0.0.5" },
    ]);
    expect(candidate.sourceMetadata).toMatchObject({ ip: "198.51.100.20" });
  });

  it("attributes the dialed tcp IP when the original input host differs", async () => {
    const { candidates } = await normalizeRecord({
      type: "tcp",
      host: "origin.example.com",
      port: "22",
      url: undefined,
      "matched-at": "10.0.0.5:2222",
      ip: "10.0.0.5",
    });
    const candidate = firstCandidate(candidates);

    expect(candidate.affectedResource).toEqual({
      type: AffectedResourceType.NetworkService,
      host: "10.0.0.5",
      port: 2222,
      transport: "tcp",
    });
    expect(candidate.assetIdentifierCandidates).toEqual([
      { type: AssetIdentifierType.IpAddress, namespace: null, value: "10.0.0.5" },
    ]);
    expect(candidate.sourceMetadata).toMatchObject({
      host: "origin.example.com",
      ip: "10.0.0.5",
      "matched-at": "10.0.0.5:2222",
    });
  });

  it("falls back from an absent tcp matched address to the url and host fields", async () => {
    const url = await normalizeRecord({
      type: "tcp",
      host: "ignored.example.com",
      port: undefined,
      url: "cache.example.com:11211",
      "matched-at": undefined,
      ip: undefined,
    });
    expect(firstCandidate(url.candidates).affectedResource).toEqual({
      type: AffectedResourceType.NetworkService,
      host: "cache.example.com",
      port: 11211,
      transport: "tcp",
    });

    const host = await normalizeRecord({
      type: "tcp",
      host: "cache.example.com:11211",
      port: undefined,
      url: undefined,
      "matched-at": undefined,
      ip: undefined,
    });
    expect(firstCandidate(host.candidates).affectedResource).toEqual({
      type: AffectedResourceType.NetworkService,
      host: "cache.example.com",
      port: 11211,
      transport: "tcp",
    });

    const explicitPort = await normalizeRecord({
      type: "tcp",
      host: "cache.example.com",
      port: "11211",
      url: undefined,
      "matched-at": undefined,
      ip: undefined,
    });
    expect(firstCandidate(explicitPort.candidates).affectedResource).toEqual({
      type: AffectedResourceType.NetworkService,
      host: "cache.example.com",
      port: 11211,
      transport: "tcp",
    });
  });

  it("parses a bracketed IPv6 tcp matched address", async () => {
    const { candidates } = await normalizeRecord({
      type: "tcp",
      host: "2001:db8::1",
      port: "6379",
      url: undefined,
      "matched-at": "[2001:db8::1]:6379",
      ip: "2001:db8::1",
    });
    const candidate = firstCandidate(candidates);

    expect(candidate.affectedResource).toEqual({
      type: AffectedResourceType.NetworkService,
      host: "[2001:db8::1]",
      port: 6379,
      transport: "tcp",
    });
    expect(candidate.assetIdentifierCandidates).toEqual([
      { type: AssetIdentifierType.IpAddress, namespace: null, value: "2001:db8::1" },
    ]);
  });

  it("warns about an unusable tcp matched address and uses the fallback fields", async () => {
    const { candidates, logger } = await normalizeRecord({
      type: "tcp",
      host: "db.example.com",
      port: "5432",
      url: undefined,
      "matched-at": "not a target",
      ip: undefined,
    });

    expect(firstCandidate(candidates).affectedResource).toEqual({
      type: AffectedResourceType.NetworkService,
      host: "db.example.com",
      port: 5432,
      transport: "tcp",
    });
    expect(logger.warn).toHaveBeenCalledWith(
      { line: 1, field: "matched-at" },
      expect.stringContaining("nuclei"),
    );
  });

  it("keeps a tcp detection with an unspecified resource when no address is usable", async () => {
    const { candidates, logger } = await normalizeRecord({
      type: "tcp",
      host: "exam ple.com",
      port: "22",
      url: undefined,
      "matched-at": undefined,
      ip: "203.0.113.5",
    });
    const candidate = firstCandidate(candidates);

    expect(candidate.affectedResource).toEqual({ type: AffectedResourceType.Unspecified });
    expect(candidate.assetIdentifierCandidates).toEqual([]);
    expect(logger.warn).toHaveBeenCalledWith(
      { line: 1, field: "host" },
      expect.stringContaining("nuclei"),
    );
  });

  it("warns about an unusable tcp IP but keeps the detection", async () => {
    const { candidates, logger } = await normalizeRecord({
      type: "tcp",
      host: "db.example.com",
      port: "5432",
      url: undefined,
      "matched-at": "db.example.com:5432",
      ip: "not-an-ip",
    });
    const candidate = firstCandidate(candidates);

    expect(candidate.assetIdentifierCandidates).toEqual([
      { type: AssetIdentifierType.DnsName, namespace: null, value: "db.example.com" },
    ]);
    expect(logger.warn).toHaveBeenCalledWith(
      { line: 1, field: "ip" },
      expect.stringContaining("nuclei"),
    );
  });

  it("maps a minimal ssl result to a TLS network service", async () => {
    const { candidates } = await normalizeRecord({
      type: "ssl",
      host: "example.com",
      port: "443",
      scheme: undefined,
      url: undefined,
      "matched-at": "example.com:443",
      ip: "93.184.216.34",
      request: undefined,
      response: undefined,
    });
    const candidate = firstCandidate(candidates);

    expect(candidate.affectedResource).toEqual({
      type: AffectedResourceType.NetworkService,
      host: "example.com",
      port: 443,
      transport: "tcp",
      protocol: "tls",
    });
    expect(candidate.assetIdentifierCandidates).toEqual([
      { type: AssetIdentifierType.DnsName, namespace: null, value: "example.com" },
      { type: AssetIdentifierType.IpAddress, namespace: null, value: "93.184.216.34" },
    ]);
    expect(candidate.evidence).toBeNull();
  });

  it("attributes the ssl dialed IP when the matched host differs from the original input", async () => {
    const { candidates } = await normalizeRecord({
      type: "ssl",
      host: "origin.example.com",
      port: "8443",
      scheme: undefined,
      url: undefined,
      "matched-at": "cert.example.net:8443",
      ip: "203.0.113.20",
      request: undefined,
      response: undefined,
    });
    const candidate = firstCandidate(candidates);

    expect(candidate.affectedResource).toEqual({
      type: AffectedResourceType.NetworkService,
      host: "cert.example.net",
      port: 8443,
      transport: "tcp",
      protocol: "tls",
    });
    // The TLS response reports the dialed connection's remote address, so the
    // IP still describes the matched subject when the original host differs.
    expect(candidate.assetIdentifierCandidates).toEqual([
      { type: AssetIdentifierType.DnsName, namespace: null, value: "cert.example.net" },
      { type: AssetIdentifierType.IpAddress, namespace: null, value: "203.0.113.20" },
    ]);
    expect(candidate.sourceMetadata).toMatchObject({
      host: "origin.example.com",
      ip: "203.0.113.20",
      "matched-at": "cert.example.net:8443",
    });
  });

  it("attributes the ssl dialed IP when the host field is omitted", async () => {
    const { candidates } = await normalizeRecord({
      type: "ssl",
      host: undefined,
      port: "8443",
      scheme: undefined,
      url: undefined,
      "matched-at": "cert.example.net:8443",
      ip: "203.0.113.22",
      request: undefined,
      response: undefined,
    });

    expect(firstCandidate(candidates).assetIdentifierCandidates).toEqual([
      { type: AssetIdentifierType.DnsName, namespace: null, value: "cert.example.net" },
      { type: AssetIdentifierType.IpAddress, namespace: null, value: "203.0.113.22" },
    ]);
  });

  it("uses the explicit ssl port when the matched address carries none", async () => {
    const { candidates } = await normalizeRecord({
      type: "ssl",
      host: "example.com",
      port: "8443",
      scheme: undefined,
      url: undefined,
      "matched-at": "example.com",
      ip: undefined,
      request: undefined,
      response: undefined,
    });

    expect(firstCandidate(candidates).affectedResource).toEqual({
      type: AffectedResourceType.NetworkService,
      host: "example.com",
      port: 8443,
      transport: "tcp",
      protocol: "tls",
    });
  });

  it("maps a JavaScript host and port without guessing transport or protocol", async () => {
    const script = "export default () => ({ response: 'ok' });";
    const { candidates } = await normalizeRecord({
      type: "javascript",
      host: "example.com",
      port: "8443",
      scheme: undefined,
      url: "https://example.com/",
      "matched-at": "example.com:8443",
      ip: "203.0.113.30",
      request: script,
      response: "ok",
    });
    const candidate = firstCandidate(candidates);

    expect(candidate.affectedResource).toEqual({
      type: AffectedResourceType.NetworkService,
      host: "example.com",
      port: 8443,
    });
    expect(candidate.affectedResource).not.toHaveProperty("transport");
    expect(candidate.affectedResource).not.toHaveProperty("protocol");
    expect(candidate.assetIdentifierCandidates).toEqual([
      { type: AssetIdentifierType.DnsName, namespace: null, value: "example.com" },
      { type: AssetIdentifierType.IpAddress, namespace: null, value: "203.0.113.30" },
    ]);
    expect(candidate.evidence).toContain(script);
    expect(candidate.evidence).toContain("<summary>Response</summary>");
  });

  it("uses the explicit JavaScript port when the matched address carries none", async () => {
    const { candidates } = await normalizeRecord({
      type: "javascript",
      host: "example.com",
      port: "443",
      url: undefined,
      "matched-at": "example.com",
      ip: undefined,
    });

    expect(firstCandidate(candidates).affectedResource).toEqual({
      type: AffectedResourceType.NetworkService,
      host: "example.com",
      port: 443,
    });
  });

  it("keeps a JavaScript detection unspecified when no host can be established", async () => {
    const { candidates, logger } = await normalizeRecord({
      type: "javascript",
      host: undefined,
      port: undefined,
      scheme: undefined,
      url: undefined,
      "matched-at": "not a target",
      ip: undefined,
    });
    const candidate = firstCandidate(candidates);

    expect(candidate.affectedResource).toEqual({ type: AffectedResourceType.Unspecified });
    expect(candidate.assetIdentifierCandidates).toEqual([]);
    expect(logger.warn).toHaveBeenCalledWith(
      { line: 1, field: "matched-at" },
      expect.stringContaining("nuclei"),
    );
  });

  it("maps a websocket URL to a web endpoint and preserves path and query", async () => {
    const { candidates } = await normalizeRecord({
      type: "websocket",
      host: "example.com",
      port: "8080",
      scheme: undefined,
      url: undefined,
      "matched-at": "ws://example.com:8080/socket?token=abc#frag",
      ip: "203.0.113.40",
    });
    const candidate = firstCandidate(candidates);

    expect(candidate.affectedResource).toEqual({
      type: AffectedResourceType.WebEndpoint,
      scheme: "ws",
      host: "example.com",
      port: 8080,
      path: "/socket",
      component: { kind: WebEndpointComponentKind.Endpoint },
      reportedUrl: "ws://example.com:8080/socket?token=abc#frag",
    });
    expect(candidate.assetIdentifierCandidates).toEqual([
      { type: AssetIdentifierType.DnsName, namespace: null, value: "example.com" },
      { type: AssetIdentifierType.IpAddress, namespace: null, value: "203.0.113.40" },
    ]);
  });

  it("materializes the websocket default ports and root path", async () => {
    const wss = await normalizeRecord({
      type: "websocket",
      host: "example.com",
      port: "443",
      url: undefined,
      "matched-at": "wss://example.com/chat",
      ip: undefined,
    });
    expect(firstCandidate(wss.candidates).affectedResource).toEqual({
      type: AffectedResourceType.WebEndpoint,
      scheme: "wss",
      host: "example.com",
      port: 443,
      path: "/chat",
      component: { kind: WebEndpointComponentKind.Endpoint },
      reportedUrl: "wss://example.com/chat",
    });

    const ws = await normalizeRecord({
      type: "websocket",
      host: "example.com",
      port: "80",
      url: undefined,
      "matched-at": "ws://example.com",
      ip: undefined,
    });
    expect(firstCandidate(ws.candidates).affectedResource).toEqual({
      type: AffectedResourceType.WebEndpoint,
      scheme: "ws",
      host: "example.com",
      port: 80,
      path: "/",
      component: { kind: WebEndpointComponentKind.Endpoint },
      reportedUrl: "ws://example.com",
    });
  });

  it("never derives a websocket method from payload text", async () => {
    const { candidates } = await normalizeRecord({
      type: "websocket",
      host: "example.com",
      port: "80",
      url: undefined,
      "matched-at": "ws://example.com/socket",
      ip: undefined,
      request: "POST /socket HTTP/1.1\r\nHost: example.com\r\n\r\n",
    });
    const resource = firstCandidate(candidates).affectedResource;

    expect(resource).not.toHaveProperty("method");
    expect(resource).toMatchObject({
      type: AffectedResourceType.WebEndpoint,
      path: "/socket",
    });
  });

  it("parses a bracketed IPv6 websocket URL", async () => {
    const { candidates } = await normalizeRecord({
      type: "websocket",
      host: undefined,
      port: undefined,
      url: undefined,
      "matched-at": "wss://[2001:db8::1]:9001/stream?x=1",
      ip: "2001:db8::1",
    });
    const candidate = firstCandidate(candidates);

    expect(candidate.affectedResource).toEqual({
      type: AffectedResourceType.WebEndpoint,
      scheme: "wss",
      host: "[2001:db8::1]",
      port: 9001,
      path: "/stream",
      component: { kind: WebEndpointComponentKind.Endpoint },
      reportedUrl: "wss://[2001:db8::1]:9001/stream?x=1",
    });
    expect(candidate.assetIdentifierCandidates).toEqual([
      { type: AssetIdentifierType.IpAddress, namespace: null, value: "2001:db8::1" },
    ]);
  });

  it("does not associate the original literal IP with a different websocket matched host", async () => {
    const { candidates } = await normalizeRecord({
      type: "websocket",
      host: "192.0.2.10",
      port: "80",
      url: undefined,
      "matched-at": "ws://socket.example.net/ws",
      ip: "192.0.2.10",
    });
    const candidate = firstCandidate(candidates);

    expect(candidate.affectedResource).toEqual({
      type: AffectedResourceType.WebEndpoint,
      scheme: "ws",
      host: "socket.example.net",
      port: 80,
      path: "/ws",
      component: { kind: WebEndpointComponentKind.Endpoint },
      reportedUrl: "ws://socket.example.net/ws",
    });
    // The websocket result's ip is dialed for the original input host, so a
    // cross-host match must not inherit it even when that host is the IP.
    expect(candidate.assetIdentifierCandidates).toEqual([
      { type: AssetIdentifierType.DnsName, namespace: null, value: "socket.example.net" },
    ]);
    expect(candidate.sourceMetadata).toMatchObject({
      host: "192.0.2.10",
      ip: "192.0.2.10",
      "matched-at": "ws://socket.example.net/ws",
    });
  });

  it("includes the websocket dial IP when the matched host matches the original input", async () => {
    const { candidates } = await normalizeRecord({
      type: "websocket",
      host: "socket.example.net",
      port: "443",
      url: undefined,
      "matched-at": "wss://socket.example.net/ws",
      ip: "203.0.113.51",
    });

    expect(firstCandidate(candidates).assetIdentifierCandidates).toEqual([
      { type: AssetIdentifierType.DnsName, namespace: null, value: "socket.example.net" },
      { type: AssetIdentifierType.IpAddress, namespace: null, value: "203.0.113.51" },
    ]);
  });

  it("uses the reported websocket url when the matched address is not a websocket URL", async () => {
    const { candidates } = await normalizeRecord({
      type: "websocket",
      host: "example.com",
      port: "8080",
      url: "ws://example.com:8080/socket",
      "matched-at": "/tmp/nuclei-response.txt",
      ip: undefined,
    });
    const candidate = firstCandidate(candidates);

    expect(candidate.affectedResource).toEqual({
      type: AffectedResourceType.WebEndpoint,
      scheme: "ws",
      host: "example.com",
      port: 8080,
      path: "/socket",
      component: { kind: WebEndpointComponentKind.Endpoint },
      reportedUrl: "ws://example.com:8080/socket",
    });
  });

  it("retains the websocket IP when the source URL establishes the same subject", async () => {
    const { candidates } = await normalizeRecord({
      type: "websocket",
      host: undefined,
      port: undefined,
      url: "wss://socket.example.net/ws",
      "matched-at": undefined,
      ip: "203.0.113.51",
    });
    const candidate = firstCandidate(candidates);

    expect(candidate.affectedResource).toEqual({
      type: AffectedResourceType.WebEndpoint,
      scheme: "wss",
      host: "socket.example.net",
      port: 443,
      path: "/ws",
      component: { kind: WebEndpointComponentKind.Endpoint },
      reportedUrl: "wss://socket.example.net/ws",
    });
    expect(candidate.assetIdentifierCandidates).toEqual([
      { type: AssetIdentifierType.DnsName, namespace: null, value: "socket.example.net" },
      { type: AssetIdentifierType.IpAddress, namespace: null, value: "203.0.113.51" },
    ]);
  });

  it("excludes the websocket IP when the source URL host differs from the matched host", async () => {
    const { candidates } = await normalizeRecord({
      type: "websocket",
      host: undefined,
      port: undefined,
      url: "wss://socket.example.net/ws",
      "matched-at": "ws://other.example.net/ws",
      ip: "203.0.113.51",
    });
    const candidate = firstCandidate(candidates);

    expect(candidate.affectedResource).toEqual({
      type: AffectedResourceType.WebEndpoint,
      scheme: "ws",
      host: "other.example.net",
      port: 80,
      path: "/ws",
      component: { kind: WebEndpointComponentKind.Endpoint },
      reportedUrl: "ws://other.example.net/ws",
    });
    expect(candidate.assetIdentifierCandidates).toEqual([
      { type: AssetIdentifierType.DnsName, namespace: null, value: "other.example.net" },
    ]);
    expect(candidate.sourceMetadata).toMatchObject({ ip: "203.0.113.51" });
  });

  it("keeps the websocket authority port when the path contains a backslash and @", async () => {
    const { candidates } = await normalizeRecord({
      type: "websocket",
      host: undefined,
      port: undefined,
      url: undefined,
      "matched-at": "ws://socket.example:8080\\u@other.example:9000/chat",
      ip: undefined,
    });

    expect(firstCandidate(candidates).affectedResource).toEqual({
      type: AffectedResourceType.WebEndpoint,
      scheme: "ws",
      host: "socket.example",
      port: 8080,
      path: "/u@other.example:9000/chat",
      component: { kind: WebEndpointComponentKind.Endpoint },
      reportedUrl: "ws://socket.example:8080\\u@other.example:9000/chat",
    });
  });

  it("falls back to websocket host and port fields without a usable URL", async () => {
    const { candidates, logger } = await normalizeRecord({
      type: "websocket",
      host: "example.com",
      port: "9001",
      url: undefined,
      scheme: undefined,
      "matched-at": undefined,
      ip: undefined,
    });
    const candidate = firstCandidate(candidates);

    expect(candidate.affectedResource).toEqual({
      type: AffectedResourceType.WebEndpoint,
      host: "example.com",
      port: 9001,
      component: { kind: WebEndpointComponentKind.Endpoint },
    });
    expect(candidate.assetIdentifierCandidates).toEqual([
      { type: AssetIdentifierType.DnsName, namespace: null, value: "example.com" },
    ]);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("keeps websocket scheme and path from explicit fields", async () => {
    const { candidates } = await normalizeRecord({
      type: "websocket",
      host: "socket.example",
      scheme: "wss",
      port: "9001",
      path: "/stream",
      url: undefined,
      "matched-at": undefined,
      ip: undefined,
    });

    expect(firstCandidate(candidates).affectedResource).toEqual({
      type: AffectedResourceType.WebEndpoint,
      scheme: "wss",
      host: "socket.example",
      port: 9001,
      path: "/stream",
      component: { kind: WebEndpointComponentKind.Endpoint },
    });
  });

  it("materializes the websocket default port from an explicit scheme", async () => {
    const { candidates } = await normalizeRecord({
      type: "websocket",
      host: "socket.example",
      scheme: "wss",
      port: undefined,
      path: "stream",
      url: undefined,
      "matched-at": undefined,
      ip: undefined,
    });

    expect(firstCandidate(candidates).affectedResource).toEqual({
      type: AffectedResourceType.WebEndpoint,
      scheme: "wss",
      host: "socket.example",
      port: 443,
      path: "/stream",
      component: { kind: WebEndpointComponentKind.Endpoint },
    });
  });

  it("warns about an unusable websocket matched address", async () => {
    const { candidates, logger } = await normalizeRecord({
      type: "websocket",
      host: "example.com",
      port: "9001",
      url: undefined,
      scheme: undefined,
      "matched-at": "http://example.com/socket",
      ip: undefined,
    });

    expect(firstCandidate(candidates).affectedResource).toEqual({
      type: AffectedResourceType.WebEndpoint,
      host: "example.com",
      port: 9001,
      component: { kind: WebEndpointComponentKind.Endpoint },
    });
    expect(logger.warn).toHaveBeenCalledWith(
      { line: 1, field: "matched-at" },
      expect.stringContaining("nuclei"),
    );
  });
});

describe("NucleiNormalizer domain and non-addressable subject mapping", () => {
  it("maps a dns detection to its queried host with an unspecified resource", async () => {
    const request =
      ";; opcode: QUERY, status: NOERROR, id: 12345\n;; flags: rd; QUERY: 1, ANSWER: 1\n\n;; QUESTION SECTION:\n;shop.example.com.\tIN\t A\n";
    const response =
      ";; opcode: QUERY, status: NOERROR, id: 12345\n;; ANSWER SECTION:\nshop.example.com.\t300\tIN\tA\t93.184.216.34\n";
    const raw = baseRecord({
      type: "dns",
      host: "shop.example.com",
      port: "53",
      scheme: undefined,
      url: undefined,
      "matched-at": "shop.example.com",
      ip: undefined,
      request,
      response,
    });
    const { candidates, logger } = await normalize(JSON.stringify(raw));
    const candidate = firstCandidate(candidates);

    expect(candidate.affectedResource).toEqual({ type: AffectedResourceType.Unspecified });
    expect(candidate.assetIdentifierCandidates).toEqual([
      { type: AssetIdentifierType.DnsName, namespace: null, value: "shop.example.com" },
    ]);
    expect(candidate.evidence).toContain(request);
    expect(candidate.evidence).toContain(response);
    expect(candidate.sourceMetadata).toEqual(raw);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("keeps DNS answers and extracted values as source context, not identifiers", async () => {
    const raw = baseRecord({
      type: "dns",
      host: "shop.example.com",
      "matched-at": "shop.example.com",
      // A resolved-address field is answer-shaped context, not subject identity.
      ip: "203.0.113.9",
      a: ["93.184.216.34", "93.184.216.35"],
      cname: "cdn.example.net",
      answer: "shop.example.com.\t300\tIN\tCNAME\tcdn.example.net.",
      "extracted-results": ["93.184.216.34", "cdn.example.net"],
    });
    const { candidates } = await normalize(JSON.stringify(raw));
    const candidate = firstCandidate(candidates);

    expect(candidate.assetIdentifierCandidates).toEqual([
      { type: AssetIdentifierType.DnsName, namespace: null, value: "shop.example.com" },
    ]);
    expect(candidate.sourceMetadata).toEqual(raw);
  });

  it("keeps the scanned input host as the DNS identity when the question differs", async () => {
    const raw = baseRecord({
      type: "dns",
      host: "example.com",
      "matched-at": "_dmarc.example.com",
      ip: undefined,
      question: "_dmarc.example.com.\tIN\t TXT",
      txt: "v=DMARC1; p=none",
    });
    const { candidates } = await normalize(JSON.stringify(raw));
    const candidate = firstCandidate(candidates);

    expect(candidate.assetIdentifierCandidates).toEqual([
      { type: AssetIdentifierType.DnsName, namespace: null, value: "example.com" },
    ]);
    expect(candidate.sourceMetadata).toMatchObject({
      "matched-at": "_dmarc.example.com",
      question: "_dmarc.example.com.\tIN\t TXT",
    });
  });

  it.each(["dns", "whois"])(
    "canonicalizes the %s subject before deriving identifiers",
    async (type) => {
      const { candidates } = await normalizeRecord({
        type,
        host: "Shop.Example.COM.",
        "matched-at": undefined,
        ip: undefined,
      });

      expect(firstCandidate(candidates).assetIdentifierCandidates).toEqual([
        { type: AssetIdentifierType.DnsName, namespace: null, value: "shop.example.com" },
      ]);
    },
  );

  it("canonicalizes a PTR detection's reverse name without promoting its answers", async () => {
    const { candidates } = await normalizeRecord({
      type: "dns",
      host: "5.3.0.203.in-addr.arpa",
      "matched-at": "5.3.0.203.in-addr.arpa",
      ip: undefined,
      ptr: "reversed.example.com",
      "extracted-results": ["reversed.example.com"],
    });

    expect(firstCandidate(candidates).affectedResource).toEqual({
      type: AffectedResourceType.Unspecified,
    });
    expect(firstCandidate(candidates).assetIdentifierCandidates).toEqual([
      {
        type: AssetIdentifierType.DnsName,
        namespace: null,
        value: "5.3.0.203.in-addr.arpa",
      },
    ]);
  });

  it("maps a whois domain query with an unspecified resource", async () => {
    const response =
      '{"ldhName":"EXAMPLE.COM","status":["active"],"events":[{"eventAction":"registration","eventDate":"1995-08-14T04:00:00Z"}]}';
    const raw = baseRecord({
      type: "whois",
      host: "example.com",
      port: undefined,
      scheme: undefined,
      url: undefined,
      "matched-at": undefined,
      ip: "203.0.113.9",
      request: undefined,
      response,
      "extracted-results": ["AS15169", "192.0.2.0/24"],
    });
    const { candidates, logger } = await normalize(JSON.stringify(raw));
    const candidate = firstCandidate(candidates);

    expect(candidate.affectedResource).toEqual({ type: AffectedResourceType.Unspecified });
    expect(candidate.assetIdentifierCandidates).toEqual([
      { type: AssetIdentifierType.DnsName, namespace: null, value: "example.com" },
    ]);
    expect(candidate.evidence).toContain(response);
    expect(candidate.evidence).not.toContain("<summary>Request</summary>");
    expect(candidate.sourceMetadata).toEqual(raw);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("maps a whois IP query to an IP identifier", async () => {
    const { candidates } = await normalizeRecord({
      type: "whois",
      host: "203.0.113.5",
      "matched-at": undefined,
      ip: undefined,
    });

    expect(firstCandidate(candidates).affectedResource).toEqual({
      type: AffectedResourceType.Unspecified,
    });
    expect(firstCandidate(candidates).assetIdentifierCandidates).toEqual([
      { type: AssetIdentifierType.IpAddress, namespace: null, value: "203.0.113.5" },
    ]);
  });

  it.each([
    "AS13335",
    "as13335",
    "AS15169.",
    "GOGL",
    "192.0.2.0/24",
    "2001:db8::/32",
    "192.0.2.0-192.0.2.255",
  ])("does not misclassify the WHOIS query %s as a DNS name or IP address", async (host) => {
    const raw = baseRecord({
      type: "whois",
      host,
      port: undefined,
      scheme: undefined,
      url: undefined,
      "matched-at": undefined,
      ip: undefined,
      request: undefined,
      response: '{"handle":"GOGL","entities":[]}',
    });
    const { candidates } = await normalize(JSON.stringify(raw));
    const candidate = firstCandidate(candidates);

    expect(candidate.affectedResource).toEqual({ type: AffectedResourceType.Unspecified });
    expect(candidate.assetIdentifierCandidates).toEqual([]);
    expect(candidate.sourceMetadata).toEqual(raw);
  });

  it("keeps file detections unspecified without deriving identity from scanner-local paths", async () => {
    const raw = baseRecord({
      type: "file",
      host: "unrelated.example.com",
      port: undefined,
      scheme: undefined,
      url: undefined,
      path: "/home/scanner/targets/web.config",
      "matched-at": "/home/scanner/targets/web.config",
      ip: "203.0.113.5",
      "matched-line": [3, 9],
      "extracted-results": ["connectionString"],
      request: undefined,
    });
    const { candidates, logger } = await normalize(JSON.stringify(raw));
    const candidate = firstCandidate(candidates);

    expect(candidate.affectedResource).toEqual({ type: AffectedResourceType.Unspecified });
    expect(candidate.assetIdentifierCandidates).toEqual([]);
    expect(candidate.sourceMetadata).toEqual(raw);
    expect(candidate.sourceMetadata.path).toBe("/home/scanner/targets/web.config");
    expect(candidate.sourceMetadata["matched-line"]).toEqual([3, 9]);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("keeps code detections unspecified while retaining execution context", async () => {
    const raw = baseRecord({
      type: "code",
      host: "scanner.internal",
      port: undefined,
      scheme: undefined,
      url: undefined,
      input: "/home/scanner/snippets/probe.js",
      "matched-at": "/home/scanner/snippets/probe.js",
      ip: "203.0.113.5",
      response: "true\n",
      stderr: "deprecation warning\n",
      engine: ["nodejs"],
      "extracted-results": ["true"],
      request: undefined,
    });
    const { candidates } = await normalize(JSON.stringify(raw));
    const candidate = firstCandidate(candidates);

    expect(candidate.affectedResource).toEqual({ type: AffectedResourceType.Unspecified });
    expect(candidate.assetIdentifierCandidates).toEqual([]);
    expect(candidate.sourceMetadata).toEqual(raw);
    expect(candidate.sourceMetadata).toMatchObject({
      engine: ["nodejs"],
      input: "/home/scanner/snippets/probe.js",
      stderr: "deprecation warning\n",
    });
    expect(candidate.evidence).toContain("true");
  });

  it("keeps an empty-type offline-HTTP-style result unspecified without treating the response file as a website", async () => {
    const response = "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n<html></html>";
    const raw = baseRecord({
      type: "",
      host: undefined,
      port: undefined,
      scheme: undefined,
      url: undefined,
      path: "/home/scanner/responses/index.html",
      "matched-at": "/home/scanner/responses/index.html",
      ip: "",
      request: undefined,
      response,
    });
    const { candidates, logger } = await normalize(JSON.stringify(raw));
    const candidate = firstCandidate(candidates);

    expect(candidate.affectedResource).toEqual({ type: AffectedResourceType.Unspecified });
    expect(candidate.assetIdentifierCandidates).toEqual([]);
    expect(candidate.evidence).toContain(response);
    expect(candidate.sourceMetadata).toEqual(raw);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("keeps an unknown future protocol unspecified and preserves its protocol value", async () => {
    const raw = baseRecord({
      type: "quantum-probe",
      host: "shop.example.com",
      port: "443",
      scheme: "https",
      url: "https://shop.example.com",
      "matched-at": "https://shop.example.com/entangled",
      ip: "93.184.216.34",
    });
    const { candidates } = await normalize(JSON.stringify(raw));
    const candidate = firstCandidate(candidates);

    expect(candidate.affectedResource).toEqual({ type: AffectedResourceType.Unspecified });
    expect(candidate.assetIdentifierCandidates).toEqual([]);
    expect(candidate.sourceMetadata.type).toBe("quantum-probe");
    expect(candidate.sourceMetadata).toEqual(raw);
  });

  it("normalizes descriptive fields even when resource semantics are unknown", async () => {
    const { candidates } = await normalizeRecord({
      type: "file",
      host: undefined,
      info: {
        name: "Exposed Config",
        description: "A configuration file was readable",
        remediation: "Restrict file permissions",
        severity: "medium",
        reference: ["https://example.com/advisory"],
        classification: { "cve-id": "CVE-2021-44228" },
      },
      "matched-at": "/tmp/config",
    });
    const candidate = firstCandidate(candidates);

    expect(candidate.title).toBe("Exposed Config");
    expect(candidate.description).toBe("A configuration file was readable");
    expect(candidate.remediation).toBe("Restrict file permissions");
    expect(candidate.severity).toBe(VulnerabilitySeverity.Medium);
    expect(candidate.weakness).toMatchObject({
      identifiers: { nuclei: ["example-template"], cve: ["CVE-2021-44228"] },
      references: ["https://example.com/advisory"],
    });
    expect(candidate.affectedResource).toEqual({ type: AffectedResourceType.Unspecified });
    expect(candidate.assetIdentifierCandidates).toEqual([]);
  });

  it("uses the shared optional-value fallbacks for non-addressable results", async () => {
    const { candidates, logger } = await normalizeRecord({
      type: "file",
      host: undefined,
      info: { name: "Config", description: 42, severity: "catastrophic" },
      timestamp: "not-a-time",
      "matched-at": "/tmp/config",
    });
    const candidate = firstCandidate(candidates);

    expect(candidates).toHaveLength(1);
    expect(candidate.description).toBeNull();
    expect(candidate.severity).toBe(VulnerabilitySeverity.Info);
    expect(candidate.observedAt).toBeNull();
    for (const field of ["description", "severity", "timestamp"]) {
      expect(logger.warn).toHaveBeenCalledWith(
        { line: 1, field },
        expect.stringContaining("nuclei"),
      );
    }
  });

  it("still requires a nonblank template id for an empty protocol", async () => {
    await expect(normalize(JSON.stringify({ "template-id": "  ", type: "" }))).rejects.toThrow(
      /line 1/u,
    );
  });

  it("normalizes mixed record types in source order with locators and duplicate preservation", async () => {
    const httpRecord = baseRecord({ type: "http" });
    const dnsRecord = baseRecord({
      type: "dns",
      host: "shop.example.com",
      port: "53",
      scheme: undefined,
      url: undefined,
      "matched-at": "shop.example.com",
      ip: undefined,
      request: ";; DNS request",
      response: ";; DNS response",
    });
    const whoisRecord = baseRecord({
      type: "whois",
      host: "example.com",
      port: undefined,
      scheme: undefined,
      url: undefined,
      "matched-at": undefined,
      ip: undefined,
      request: undefined,
      response: '{"ldhName":"EXAMPLE.COM"}',
    });
    const fileRecord = baseRecord({
      type: "file",
      host: undefined,
      port: undefined,
      scheme: undefined,
      url: undefined,
      path: "/home/scanner/targets/web.config",
      "matched-at": "/home/scanner/targets/web.config",
      ip: undefined,
      "matched-line": [3],
      request: undefined,
    });
    const codeRecord = baseRecord({
      type: "code",
      host: undefined,
      port: undefined,
      scheme: undefined,
      url: undefined,
      input: "/home/scanner/snippets/probe.js",
      "matched-at": "/home/scanner/snippets/probe.js",
      ip: undefined,
      response: "true",
      request: undefined,
    });
    const offlineRecord = baseRecord({
      type: "",
      host: undefined,
      port: undefined,
      scheme: undefined,
      url: undefined,
      path: "/home/scanner/responses/index.html",
      "matched-at": "/home/scanner/responses/index.html",
      ip: undefined,
      request: undefined,
    });
    const unknownRecord = baseRecord({
      type: "future-protocol",
      host: "future.example.com",
      "matched-at": "future://future.example.com",
      ip: undefined,
    });
    const failedDns = baseRecord({ type: "dns", "matcher-status": false });
    const erroredWhois = baseRecord({ type: "whois", error: "whois lookup failed" });

    const source = [
      JSON.stringify(httpRecord),
      "",
      JSON.stringify(dnsRecord),
      JSON.stringify(whoisRecord),
      JSON.stringify(fileRecord),
      JSON.stringify(codeRecord),
      JSON.stringify(offlineRecord),
      JSON.stringify(unknownRecord),
      JSON.stringify(dnsRecord),
      JSON.stringify(failedDns),
      JSON.stringify(erroredWhois),
    ].join("\n");

    const { candidates, logger } = await normalize(source);

    expect(candidates.map((candidate) => candidate.sourceRecord)).toEqual([
      "line:1",
      "line:3",
      "line:4",
      "line:5",
      "line:6",
      "line:7",
      "line:8",
      "line:9",
    ]);
    expect(candidates.map((candidate) => candidate.sourceMetadata.type)).toEqual([
      "http",
      "dns",
      "whois",
      "file",
      "code",
      "",
      "future-protocol",
      "dns",
    ]);
    expect(candidates[1]?.assetIdentifierCandidates).toEqual(
      candidates[7]?.assetIdentifierCandidates,
    );
    expect(candidates[1]?.evidence).toContain(";; DNS request");
    expect(candidates[1]?.evidence).toContain(";; DNS response");
    expect(candidates[2]?.evidence).toContain('{"ldhName":"EXAMPLE.COM"}');
    expect(candidates[4]?.evidence).toContain("true");
    expect(candidates[3]?.sourceMetadata["matched-line"]).toEqual([3]);
    const nonAddressable = candidates.filter(
      (entry) => !["http", "dns", "whois"].includes(String(entry.sourceMetadata.type)),
    );
    for (const candidate of nonAddressable) {
      expect(candidate.affectedResource).toEqual({ type: AffectedResourceType.Unspecified });
      expect(candidate.assetIdentifierCandidates).toEqual([]);
    }
    expect(candidates[0]?.affectedResource).toMatchObject({
      type: AffectedResourceType.WebEndpoint,
    });
    for (const candidate of [candidates[1], candidates[2], candidates[7]]) {
      expect(candidate?.affectedResource).toEqual({ type: AffectedResourceType.Unspecified });
    }
    expect(candidates[1]?.assetIdentifierCandidates).toEqual([
      { type: AssetIdentifierType.DnsName, namespace: null, value: "shop.example.com" },
    ]);
    expect(candidates[2]?.assetIdentifierCandidates).toEqual([
      { type: AssetIdentifierType.DnsName, namespace: null, value: "example.com" },
    ]);
    expect(logger.debug).toHaveBeenCalledWith(
      { line: 10, reason: "matcher-status is false" },
      expect.any(String),
    );
    expect(logger.debug).toHaveBeenCalledWith(
      { line: 11, reason: "error reported" },
      expect.any(String),
    );
    expect(logger.warn).not.toHaveBeenCalled();
  });
});

describe("NucleiNormalizer reference scan", () => {
  it("normalizes the Juice Shop scan in source order", async () => {
    const { candidates } = await normalize(juiceshopFixture);

    expect(candidates).toHaveLength(19);
    expect(candidates.map((candidate) => candidate.sourceRecord)).toEqual(
      Array.from({ length: 19 }, (_value, index) => `line:${index + 1}`),
    );
    expect(
      candidates.filter((candidate) => candidate.severity === VulnerabilitySeverity.Info),
    ).toHaveLength(18);
    expect(
      candidates.filter((candidate) => candidate.severity === VulnerabilitySeverity.Medium),
    ).toHaveLength(1);
    expect(candidates.filter((candidate) => candidate.evidence !== null)).toHaveLength(19);

    for (const candidate of candidates) {
      expect(candidate.assetIdentifierCandidates).toEqual([
        { type: AssetIdentifierType.DnsName, namespace: null, value: "localhost" },
        { type: AssetIdentifierType.IpAddress, namespace: null, value: "127.0.0.1" },
      ]);
      expect(candidate.affectedResource).toMatchObject({
        type: AffectedResourceType.WebEndpoint,
        scheme: "http",
        host: "localhost",
        port: 8080,
      });
    }

    expect(candidates[0]?.affectedResource).toMatchObject({
      path: "/api-docs/swagger.yaml",
    });
    expect(candidates[0]?.sourceMetadata.meta).toEqual({ paths: "/api-docs/swagger.yaml" });
    expect(candidates[4]?.affectedResource).toMatchObject({ path: "/robots.txt" });
    expect(candidates[14]?.affectedResource).toMatchObject({
      path: "/.well-known/security.txt",
    });
    expect(candidates[15]?.affectedResource).toMatchObject({ path: "/metrics" });
    expect(candidates[15]?.weakness.cvss).toEqual([
      {
        score: 5.3,
        vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N",
        version: "3.1",
      },
    ]);

    expect(candidates[0]?.title).toBe("Public Swagger API - Detect");
    expect(candidates[1]?.title).toBe("FingerprintHub Technology Fingerprint (qm-system)");

    const missingHeaders = candidates.filter((candidate) =>
      candidate.weakness.identifiers["nuclei-matcher"]?.[0]?.startsWith(
        "http-missing-security-headers:",
      ),
    );
    expect(missingHeaders).toHaveLength(8);
    expect(new Set(missingHeaders.map((candidate) => candidate.title)).size).toBe(8);
    expect(new Set(missingHeaders.map((candidate) => candidate.title))).toEqual(
      new Set([
        "HTTP Missing Security Headers (cross-origin-resource-policy)",
        "HTTP Missing Security Headers (strict-transport-security)",
        "HTTP Missing Security Headers (content-security-policy)",
        "HTTP Missing Security Headers (permissions-policy)",
        "HTTP Missing Security Headers (x-permitted-cross-domain-policies)",
        "HTTP Missing Security Headers (referrer-policy)",
        "HTTP Missing Security Headers (cross-origin-embedder-policy)",
        "HTTP Missing Security Headers (cross-origin-opener-policy)",
      ]),
    );
  });

  it("normalizes through the classifier with local registration", async () => {
    const classifier = new Classifier(createLogger() as unknown as Logger);
    classifier.registerNormalizer("nuclei", new NucleiNormalizer());

    const candidates = await classifier.normalize(
      "nuclei",
      new TextEncoder().encode(juiceshopFixture),
    );

    expect(candidates).toHaveLength(19);
    expect(candidates[0]?.source).toBe("nuclei");
    expect(candidates[0]?.sourceMetadata.meta).toEqual({ paths: "/api-docs/swagger.yaml" });
    expect(candidates[6]?.weakness.identifiers["nuclei-matcher"]).toEqual([
      "http-missing-security-headers:strict-transport-security",
    ]);
  });
});
