import { describe, expect, it } from "vitest";

import {
  findingWeaknessSchema,
  normalizeWeakness,
  observationWeaknessSchema,
  weaknessSchema,
} from "./weakness.js";

describe("weakness schemas", () => {
  it("normalizes known identifiers and preserves opaque source identifiers", () => {
    expect(
      normalizeWeakness({
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

  it("canonicalizes bare CWE identifiers and handles prototype-sensitive namespaces", () => {
    expect(
      normalizeWeakness({
        identifiers: {
          constructor: [" Rule-X "],
          cwe: ["284", "cwe-284"],
        },
      }),
    ).toEqual({
      identifiers: {
        constructor: ["Rule-X"],
        cwe: ["CWE-284"],
      },
    });
  });

  it("uses a canonical empty representation and removes empty namespaces", () => {
    expect(weaknessSchema.parse({})).toEqual({ identifiers: {} });
    expect(weaknessSchema.parse({ identifiers: { cve: [] } })).toEqual({ identifiers: {} });
    expect(findingWeaknessSchema.parse({ identifiers: {} })).toEqual({ identifiers: {} });
    expect(observationWeaknessSchema.parse({ identifiers: {} })).toEqual({ identifiers: {} });
  });

  it("rejects invalid namespaces, empty identifiers, and unknown fields", () => {
    expect(() => weaknessSchema.parse({ identifiers: { "not valid": ["x"] } })).toThrow();
    expect(() => weaknessSchema.parse({ identifiers: { cve: ["   "] } })).toThrow();
    expect(() => weaknessSchema.parse({ extra: true })).toThrow();
    expect(() => weaknessSchema.parse({ identifiers: { cwe: ["not-a-cwe"] } })).toThrow();
    expect(() => weaknessSchema.parse(JSON.parse('{"identifiers":{"__proto__":["x"]}}'))).toThrow();
  });

  it("replaces the complete identifiers value when parsed independently", () => {
    const first = weaknessSchema.parse({ identifiers: { cve: ["CVE-2026-0001"] } });
    const replacement = weaknessSchema.parse({ identifiers: { cwe: ["CWE-89"] } });

    expect(first).toEqual({ identifiers: { cve: ["CVE-2026-0001"] } });
    expect(replacement).toEqual({ identifiers: { cwe: ["CWE-89"] } });
  });
});
