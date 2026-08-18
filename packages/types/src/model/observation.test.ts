import { describe, expect, it } from "vitest";

import { AffectedResourceType } from "./affected-resource.js";
import {
  manualObservationInputSchema,
  moveObservationInputSchema,
  observationSchema,
  ObservationSource,
  updateObservationSchema,
} from "./observation.js";
import { VulnerabilitySeverity } from "./vulnerability.js";

const observation = {
  id: "2713d833-eb13-4517-ac7c-7761545ed42a",
  findingId: "9d7acdd0-fad1-46c9-8218-1793f421f0fe",
  ingestionId: null,
  source: ObservationSource.Manual,
  title: "Manual confirmation",
  description: null,
  evidence: null,
  remediation: null,
  severity: VulnerabilitySeverity.Medium,
  weakness: { identifiers: {} },
  affectedResource: { type: AffectedResourceType.Asset },
  observedAt: new Date("2026-08-17T10:00:00.000Z"),
  createdAt: new Date("2026-08-17T10:00:00.000Z"),
  updatedAt: new Date("2026-08-17T10:00:00.000Z"),
  createdBy: "85196743-cfba-4afb-b286-d36be32a64a4",
  updatedBy: "85196743-cfba-4afb-b286-d36be32a64a4",
};

describe("observation provenance", () => {
  it("requires manual observations to omit ingestion identity", () => {
    expect(observationSchema.parse(observation)).toMatchObject({
      source: ObservationSource.Manual,
      ingestionId: null,
    });
    expect(() =>
      observationSchema.parse({
        ...observation,
        ingestionId: "40b71ac1-b003-46b4-a1fc-8e8d384dd140",
      }),
    ).toThrow();
  });

  it("requires imported observations to identify their ingestion", () => {
    const ingestionId = "40b71ac1-b003-46b4-a1fc-8e8d384dd140";

    expect(
      observationSchema.parse({
        ...observation,
        source: ObservationSource.Nuclei,
        ingestionId,
      }),
    ).toMatchObject({ source: ObservationSource.Nuclei, ingestionId });
    expect(() =>
      observationSchema.parse({
        ...observation,
        source: ObservationSource.Nuclei,
        ingestionId: null,
      }),
    ).toThrow();
  });
});

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

describe("observation move schema", () => {
  it("accepts only the target finding identity", () => {
    const targetFindingId = "9d7acdd0-fad1-46c9-8218-1793f421f0fe";

    expect(moveObservationInputSchema.parse({ targetFindingId })).toEqual({ targetFindingId });
  });

  it.each(["findingId", "observationId", "source", "title"])(
    "rejects server-owned or unrelated %s fields",
    (field) => {
      expect(() =>
        moveObservationInputSchema.parse({
          targetFindingId: "9d7acdd0-fad1-46c9-8218-1793f421f0fe",
          [field]: "2713d833-eb13-4517-ac7c-7761545ed42a",
        }),
      ).toThrow();
    },
  );
});
