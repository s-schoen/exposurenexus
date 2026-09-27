import { describe, expect, it } from "vitest";

import { weaknessSchema } from "@/features/findings/lib/weakness-preview.ts";

describe("weakness preview schema", () => {
  it("keeps identifier-only draft values valid", () => {
    expect(weaknessSchema.parse({ identifiers: { CWE: [" cwe-89 "] } })).toEqual({
      identifiers: { cwe: ["CWE-89"] },
    });
    expect(weaknessSchema.parse({})).toEqual({ identifiers: {} });
  });

  it("accepts and normalizes enriched draft values", () => {
    expect(
      weaknessSchema.parse({
        identifiers: {},
        references: ["https://example.com/advisory", "https://example.com/advisory"],
        cvss: [{ score: 0 }, { version: "3.1" }],
        epss: { score: 0, percentile: 1 },
      }),
    ).toEqual({
      identifiers: {},
      references: ["https://example.com/advisory"],
      cvss: [{ score: 0 }, { version: "3.1" }],
      epss: { score: 0, percentile: 1 },
    });
  });

  it("rejects enrichment values outside their bounds", () => {
    expect(weaknessSchema.safeParse({ cvss: [{ score: 10.1 }] }).success).toBe(false);
    expect(weaknessSchema.safeParse({ cvss: [{ score: -0.1 }] }).success).toBe(false);
    expect(weaknessSchema.safeParse({ epss: { score: 1.1 } }).success).toBe(false);
    expect(weaknessSchema.safeParse({ epss: { percentile: -0.1 } }).success).toBe(false);
  });
});
