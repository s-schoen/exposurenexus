import { describe, expect, it } from "vitest";

import { nonEmptyWeaknessSchema, weaknessSchema } from "./weakness.js";

describe("weakness schemas", () => {
  it("normalizes known identifiers and preserves opaque source identifiers", () => {
    expect(
      weaknessSchema.parse({
        identifiers: {
          CVE: [" cve-2026-0002 ", "CVE-2026-0001", "CVE-2026-0002"],
          cwe: [" cWe-89 "],
          ghsa: [" ghsa-abcd-1234-Efgh "],
          nuclei: [" Rule-Z ", "rule-a", " Rule-Z "],
        },
      }),
    ).toEqual({
      identifiers: {
        cve: ["CVE-2026-0001", "CVE-2026-0002"],
        cwe: ["CWE-89"],
        ghsa: ["GHSA-ABCD-1234-EFGH"],
        nuclei: ["Rule-Z", "rule-a"],
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
});
