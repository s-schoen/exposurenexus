import { describe, expect, it } from "vitest";

import { weaknessSchema } from "./weakness.js";

const references = ["https://example.com/advisory", "https://example.com/advisory"];
const cvss = [
  {
    score: 9.8,
    vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H",
    version: "3.1",
  },
  { vector: "CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N" },
  { score: 0 },
  { version: "4.0" },
];

describe("weakness schema", () => {
  it("keeps identifier-only values valid", () => {
    expect(weaknessSchema.parse({})).toEqual({ identifiers: {} });
    expect(weaknessSchema.parse({ identifiers: { CWE: ["89"] } })).toEqual({
      identifiers: { CWE: ["89"] },
    });
  });

  it("preserves structured references, CVSS assessments, and EPSS data", () => {
    const weakness = {
      identifiers: { cwe: ["CWE-89"] },
      references,
      cvss,
      epss: { score: 0, percentile: 0.999 },
    };

    expect(weaknessSchema.parse(weakness)).toEqual(weakness);
  });

  it("accepts partial assessments independently", () => {
    expect(weaknessSchema.parse({ references: ["https://example.com/advisory"] })).toEqual({
      identifiers: {},
      references: ["https://example.com/advisory"],
    });
    expect(weaknessSchema.parse({ cvss: [{}], epss: {} })).toEqual({
      identifiers: {},
      cvss: [{}],
      epss: {},
    });
  });

  it.each([
    ["cvss score below the range", { cvss: [{ score: -0.1 }] }],
    ["cvss score above the range", { cvss: [{ score: 10.1 }] }],
    ["cvss score that is not finite", { cvss: [{ score: Number.POSITIVE_INFINITY }] }],
    ["epss score below the range", { epss: { score: -0.1 } }],
    ["epss score above the range", { epss: { score: 1.1 } }],
    ["epss percentile that is not finite", { epss: { percentile: Number.NaN } }],
  ])("rejects an out-of-range %s", (_, weakness) => {
    expect(weaknessSchema.safeParse({ identifiers: {}, ...weakness }).success).toBe(false);
  });

  it("rejects malformed enrichment shapes and unknown fields", () => {
    expect(weaknessSchema.safeParse({ references: "https://example.com/advisory" }).success).toBe(
      false,
    );
    expect(weaknessSchema.safeParse({ references: [""] }).success).toBe(false);
    expect(weaknessSchema.safeParse({ cvss: [{ severity: "crit" }] }).success).toBe(false);
    expect(weaknessSchema.safeParse({ cvss: [{ score: "9.8" }] }).success).toBe(false);
    expect(weaknessSchema.safeParse({ epss: { score: 0.5, rank: 1 } }).success).toBe(false);
    expect(weaknessSchema.safeParse({ enrichment: {} }).success).toBe(false);
  });
});
