import { AffectedResourceType } from "@exposurenexus/types/model/affected-resource";
import { VulnerabilitySeverity } from "@exposurenexus/types/model/vulnerability";
import { describe, expect, it } from "vitest";

import { translateNucleiJsonl, translateNucleiRecord } from "./nuclei.js";

const ingestionTime = new Date("2026-01-02T03:04:05.000Z");

const httpRecord = {
  "template-id": "admin-panel",
  info: {
    name: "Exposed Admin Endpoint",
    description: "Administrative interface is reachable externally",
    remediation: "Restrict access to internal networks",
    severity: "HIGH",
    classification: {
      "cve-id": ["cve-2026-34256"],
      "cwe-id": "cwe-200",
      "cvss-score": 8.1,
      "cvss-metrics": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H",
      cpe: "cpe:2.3:a:example:product:1.0:*:*:*:*:*:*:*",
    },
  },
  type: "http",
  host: "EXAMPLE.com:443",
  scheme: "https",
  url: "https://EXAMPLE.com:443/admin?debug=true#fragment",
  path: "/ignored-by-the-reported-url",
  method: "get",
  request: "GET /admin HTTP/1.1",
  response: "HTTP/1.1 200 OK",
  "curl-command": "curl https://EXAMPLE.com/admin",
  timestamp: "2026-01-03T04:05:06+00:00",
};

describe("nuclei translator", () => {
  it("translates HTTP records into normalized observation drafts", () => {
    const result = translateNucleiRecord(httpRecord, ingestionTime);

    expect(result).toEqual({
      status: "translated",
      draft: {
        source: "nuclei",
        title: "Exposed Admin Endpoint",
        description: "Administrative interface is reachable externally",
        remediation: "Restrict access to internal networks",
        severity: VulnerabilitySeverity.High,
        weakness: {
          identifiers: {
            cve: ["CVE-2026-34256"],
            cwe: ["CWE-200"],
            nuclei: ["admin-panel"],
          },
        },
        affectedResource: {
          type: AffectedResourceType.WebEndpoint,
          reportedUrl: "https://EXAMPLE.com:443/admin?debug=true#fragment",
          scheme: "https",
          host: "example.com",
          port: 443,
          path: "/admin",
          method: "get",
        },
        observedAt: new Date("2026-01-03T04:05:06.000Z"),
        evidence: expect.stringContaining("GET /admin HTTP/1.1"),
      },
    });

    if (result.status === "translated") {
      expect(result.draft.evidence).toContain("HTTP/1.1 200 OK");
      expect(result.draft.evidence).toContain("curl https://EXAMPLE.com/admin");
    }
  });

  it("supports HTTPS records and falls back missing values", () => {
    const result = translateNucleiRecord(
      {
        "template-id": "missing-security-header",
        info: {
          severity: "not-a-severity",
          classification: null,
        },
        type: "https",
        host: "api.example.com",
        path: "/headers",
      },
      ingestionTime,
    );

    expect(result).toEqual({
      status: "translated",
      draft: {
        source: "nuclei",
        title: "missing-security-header",
        severity: VulnerabilitySeverity.Info,
        weakness: {
          identifiers: {
            nuclei: ["missing-security-header"],
          },
        },
        affectedResource: {
          type: AffectedResourceType.WebEndpoint,
          scheme: "https",
          host: "api.example.com",
          path: "/headers",
        },
        observedAt: ingestionTime,
      },
    });
  });

  it("returns a typed unsupported result for non-HTTP protocols", () => {
    expect(
      translateNucleiRecord(
        {
          "template-id": "postgres-exposed",
          info: {},
          type: "tcp",
          host: "db.example.com",
        },
        ingestionTime,
      ),
    ).toEqual({
      status: "unsupported",
      reason: {
        code: "unsupported_protocol",
        protocol: "tcp",
      },
    });
  });

  it("translates JSONL records without retaining source payloads", () => {
    const results = translateNucleiJsonl(
      `${JSON.stringify(httpRecord)}\n\n${JSON.stringify({
        ...httpRecord,
        type: "dns",
      })}\n`,
      ingestionTime,
    );

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ status: "translated" });
    expect(results[1]).toMatchObject({
      status: "unsupported",
      reason: { protocol: "dns" },
    });
    expect(JSON.stringify(results[0])).not.toContain('"template-id"');
    expect(JSON.stringify(results[0])).not.toContain('"request"');
  });

  it("rejects malformed records and invalid ingestion times", () => {
    expect(() => translateNucleiRecord({ type: "http", info: {} }, ingestionTime)).toThrow();
    expect(() => translateNucleiRecord(httpRecord, new Date(Number.NaN))).toThrow(
      "ingestion time must be a valid date",
    );
  });
});
