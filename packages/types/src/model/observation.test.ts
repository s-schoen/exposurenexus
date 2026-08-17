import { describe, expect, it } from "vitest";

import { AffectedResourceType } from "./affected-resource.js";
import {
  manualObservationInputSchema,
  ObservationSource,
  updateObservationSchema,
} from "./observation.js";
import { VulnerabilitySeverity } from "./vulnerability.js";

describe("manual observation input schema", () => {
  it("accepts only observation-owned user input", () => {
    const input = {
      title: "Manual confirmation",
      description: "Confirmed during review",
      evidence: "GET /admin returned 200",
      remediation: "Require authentication",
      severity: VulnerabilitySeverity.Medium,
      weakness: { identifiers: { cwe: ["cwe-200"] } },
      affectedResource: { type: AffectedResourceType.Asset },
      observedAt: new Date("2026-08-17T10:00:00.000Z"),
    };

    expect(manualObservationInputSchema.parse(input)).toEqual({
      ...input,
      weakness: { identifiers: { cwe: ["CWE-200"] } },
    });
  });

  it.each([
    ["source", ObservationSource.Nuclei],
    ["ingestionId", "9d7acdd0-fad1-46c9-8218-1793f421f0fe"],
    ["findingId", "2713d833-eb13-4517-ac7c-7761545ed42a"],
    ["id", "2713d833-eb13-4517-ac7c-7761545ed42a"],
    ["createdAt", new Date()],
    ["updatedAt", new Date()],
    ["createdBy", "85196743-cfba-4afb-b286-d36be32a64a4"],
    ["updatedBy", "85196743-cfba-4afb-b286-d36be32a64a4"],
  ])("rejects the server-owned %s field", (field, value) => {
    expect(() => manualObservationInputSchema.parse({ [field]: value })).toThrow();
  });
});

describe("observation update schema", () => {
  it("accepts mutable fields and replaces identity values as complete objects", () => {
    const observedAt = new Date("2026-08-17T10:00:00.000Z");

    expect(
      updateObservationSchema.parse({
        title: "Corrected observation",
        description: null,
        evidence: "Updated evidence",
        remediation: null,
        severity: VulnerabilitySeverity.High,
        weakness: { identifiers: { cwe: ["cwe-89"] } },
        affectedResource: {
          type: AffectedResourceType.SourceCode,
          file: "src/query.ts",
        },
        observedAt,
      }),
    ).toEqual({
      title: "Corrected observation",
      description: null,
      evidence: "Updated evidence",
      remediation: null,
      severity: VulnerabilitySeverity.High,
      weakness: { identifiers: { cwe: ["CWE-89"] } },
      affectedResource: {
        type: AffectedResourceType.SourceCode,
        file: "src/query.ts",
      },
      observedAt,
    });
  });

  it("requires at least one mutable field", () => {
    expect(() => updateObservationSchema.parse({})).toThrow();
  });

  it.each([
    ["id", "2713d833-eb13-4517-ac7c-7761545ed42a"],
    ["findingId", "2713d833-eb13-4517-ac7c-7761545ed42a"],
    ["source", ObservationSource.Nuclei],
    ["ingestionId", "2713d833-eb13-4517-ac7c-7761545ed42a"],
    ["createdAt", new Date()],
    ["updatedAt", new Date()],
    ["createdBy", "85196743-cfba-4afb-b286-d36be32a64a4"],
    ["updatedBy", "85196743-cfba-4afb-b286-d36be32a64a4"],
  ])("rejects immutable %s fields", (field, value) => {
    expect(() => updateObservationSchema.parse({ title: "Correction", [field]: value })).toThrow();
  });
});
