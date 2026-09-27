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

  it("maps invalid and missing timestamps to null without substituting the current time", async () => {
    const invalid = await normalizeRecord({ timestamp: "not-a-timestamp" });
    expect(firstCandidate(invalid.candidates).observedAt).toBeNull();
    expect(invalid.logger.warn).toHaveBeenCalledWith(
      { line: 1, field: "timestamp" },
      expect.any(String),
    );

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

  it.each(["tcp", "ssl", "websocket", "javascript", "dns", "whois", "file", "code", ""])(
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
