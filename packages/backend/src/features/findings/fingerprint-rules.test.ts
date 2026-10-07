import { describe, expect, it } from "vitest";

import { fingerprintsSchema } from "./fingerprint-rules.js";

describe("fingerprint schema", () => {
  it("lowercases namespaces and keeps opaque values case-sensitive", () => {
    expect(
      fingerprintsSchema.parse({
        Semgrep: [" Abc_1 ", "abc_0", "Abc_1"],
        "trivy.vuln": ["sha256:f2b9"],
      }),
    ).toEqual({
      semgrep: ["Abc_1", "abc_0"],
      "trivy.vuln": ["sha256:f2b9"],
    });
  });

  it("uses a canonical empty representation and removes empty namespaces", () => {
    expect(fingerprintsSchema.parse({})).toEqual({});
    expect(fingerprintsSchema.parse({ semgrep: [] })).toEqual({});
  });

  it("sorts namespaces so equal fingerprints have equal JSON", () => {
    expect(Object.keys(fingerprintsSchema.parse({ zap: ["b"], bearer: ["a"] }))).toEqual([
      "bearer",
      "zap",
    ]);
  });

  it.each([
    ["blank namespace", { "": ["abc"] }],
    ["namespace with a slash", { "sarif/primaryLocationLineHash": ["abc"] }],
    ["namespace with a leading digit", { "1semgrep": ["abc"] }],
    ["blank value", { semgrep: ["  "] }],
    ["non-array values", { semgrep: "abc" }],
  ])("rejects a %s", (_label, fingerprints) => {
    expect(() => fingerprintsSchema.parse(fingerprints)).toThrow();
  });
});
