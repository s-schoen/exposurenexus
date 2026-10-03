import { describe, expect, it } from "vitest";

import { nonEmptyWeaknessSchema, weaknessSchema } from "./weakness-rules.js";

describe("weakness schemas", () => {
  it("normalizes known identifiers and preserves opaque source identifiers", () => {
    expect(
      weaknessSchema.parse({
        identifiers: {
          CVE: [" cve-2026-0002 ", "CVE-2026-0001", "CVE-2026-0002"],
          cwe: [" cWe-89 "],
          ghsa: [" ghsa-abcd-1234-Efgh "],
          scanner: [" Rule-Z ", "rule-a", " Rule-Z "],
        },
      }),
    ).toEqual({
      identifiers: {
        cve: ["CVE-2026-0001", "CVE-2026-0002"],
        cwe: ["CWE-89"],
        ghsa: ["GHSA-ABCD-1234-EFGH"],
        scanner: ["Rule-Z", "rule-a"],
      },
    });
  });

  it("canonicalizes bare CWE identifiers", () => {
    expect(
      weaknessSchema.parse({
        identifiers: {
          cwe: ["284", "cwe-284"],
        },
      }),
    ).toEqual({
      identifiers: {
        cwe: ["CWE-284"],
      },
    });
  });

  it("strips CWE leading zeros so one weakness has one identifier", () => {
    expect(weaknessSchema.parse({ identifiers: { cwe: ["CWE-079", "79", "cwe-0079"] } })).toEqual({
      identifiers: { cwe: ["CWE-79"] },
    });
  });

  it.each(["CWE-0", "0", "CWE-000"])("rejects the non-positive CWE identifier %j", (cwe) => {
    expect(() => weaknessSchema.parse({ identifiers: { cwe: [cwe] } })).toThrow();
  });

  it("uses a canonical empty representation and removes empty namespaces", () => {
    expect(weaknessSchema.parse({})).toEqual({ identifiers: {} });
    expect(weaknessSchema.parse({ identifiers: { cve: [] } })).toEqual({ identifiers: {} });
  });

  it("rejects invalid namespaces, empty identifiers, and unknown fields", () => {
    expect(() => weaknessSchema.parse({ identifiers: { "not valid": ["x"] } })).toThrow();
    expect(() => weaknessSchema.parse({ identifiers: { cve: ["   "] } })).toThrow();
    expect(() => weaknessSchema.parse({ extra: true })).toThrow();
    expect(() => weaknessSchema.parse({ identifiers: { cwe: ["not-a-cwe"] } })).toThrow();
  });

  it("requires source mappings to contain an identifier", () => {
    expect(() => nonEmptyWeaknessSchema.parse({})).toThrow();
    expect(() => nonEmptyWeaknessSchema.parse({ identifiers: { cve: [] } })).toThrow();
    expect(nonEmptyWeaknessSchema.parse({ identifiers: { cwe: ["CWE-89"] } })).toEqual({
      identifiers: { cwe: ["CWE-89"] },
    });
  });

  it("keeps enrichment optional and preserves partial and zero-valued assessments", () => {
    expect(weaknessSchema.parse({ identifiers: { cwe: ["89"] } })).toEqual({
      identifiers: { cwe: ["CWE-89"] },
    });
    expect(
      weaknessSchema.parse({
        identifiers: { cwe: ["89"] },
        cvss: [{ score: 0 }, { vector: "CVSS:3.1/AV:N/AC:L" }, { version: "3.1" }],
        epss: { score: 0, percentile: 0.997 },
      }),
    ).toEqual({
      identifiers: { cwe: ["CWE-89"] },
      cvss: [{ score: 0 }, { vector: "CVSS:3.1/AV:N/AC:L" }, { version: "3.1" }],
      epss: { score: 0, percentile: 0.997 },
    });
  });

  it("deduplicates exact references while preserving text, casing, and first-occurrence order", () => {
    expect(
      weaknessSchema.parse({
        identifiers: { cwe: ["CWE-89"] },
        references: [
          "https://example.com/One",
          "https://example.com/one",
          "https://example.com/One",
          " https://example.com/spaced ",
        ],
      }),
    ).toEqual({
      identifiers: { cwe: ["CWE-89"] },
      references: [
        "https://example.com/One",
        "https://example.com/one",
        " https://example.com/spaced ",
      ],
    });
  });

  it("preserves reported CVSS scores instead of recalculating them from vectors", () => {
    expect(
      weaknessSchema.parse({
        cvss: [{ score: 1.5, vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H" }],
      }),
    ).toEqual({
      identifiers: {},
      cvss: [{ score: 1.5, vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H" }],
    });
  });

  it("rejects enrichment values outside their bounds or with unknown fields", () => {
    expect(() => weaknessSchema.parse({ references: [""] })).toThrow();
    expect(() => weaknessSchema.parse({ cvss: [{ score: 10.1 }] })).toThrow();
    expect(() => weaknessSchema.parse({ cvss: [{ score: -0.1 }] })).toThrow();
    expect(() => weaknessSchema.parse({ cvss: [{ severity: "critical" }] })).toThrow();
    expect(() => weaknessSchema.parse({ epss: { score: 1.1 } })).toThrow();
    expect(() => weaknessSchema.parse({ epss: { percentile: -0.1 } })).toThrow();
    expect(() => weaknessSchema.parse({ epss: { score: 0.5, rank: 1 } })).toThrow();
  });
});
