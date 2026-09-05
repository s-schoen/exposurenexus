import { describe, expect, it } from "vitest";

import { AssetIdentifierType, assetIdentifierSchema } from "./asset-identifier.js";
import { dateSchema } from "./date.js";
import { createFindingSchema } from "./finding.js";
import { manualObservationInputSchema } from "./observation.js";
import { vulnerabilityInputSchema, VulnerabilityType } from "./vulnerability.js";
import { weaknessSchema } from "./weakness.js";

describe("serialized shapes", () => {
  it("preserves identifiers for backend interpretation", () => {
    const identifier = {
      type: AssetIdentifierType.DnsName,
      value: "BÜCHER.Example.",
      namespace: " tenant ",
    };
    expect(assetIdentifierSchema.parse(identifier)).toEqual(identifier);
    const weakness = { identifiers: { CWE: [" 89 ", " 89 "] } };
    expect(weaknessSchema.parse(weakness)).toEqual(weakness);
    expect(
      vulnerabilityInputSchema.parse({
        type: VulnerabilityType.Cve,
        identifier: " cve-2026-0001 ",
        title: " Example ",
        severity: "high",
      }).identifier,
    ).toBe(" cve-2026-0001 ");
  });

  it("rejects malformed shapes without applying business rules", () => {
    expect(assetIdentifierSchema.safeParse({ type: "unknown", value: "example.com" }).success).toBe(
      false,
    );
    expect(weaknessSchema.safeParse({ identifiers: { cwe: [89] } }).success).toBe(false);
    expect(manualObservationInputSchema.safeParse({ title: 42 }).success).toBe(false);
    expect(createFindingSchema.safeParse({ assetId: "invalid" }).success).toBe(false);
  });

  it("decodes dates without truncating time", () => {
    expect(dateSchema.parse("2026-08-01T14:35:00Z")).toEqual(new Date("2026-08-01T14:35:00Z"));
    expect(dateSchema.safeParse("invalid").success).toBe(false);
  });
});
