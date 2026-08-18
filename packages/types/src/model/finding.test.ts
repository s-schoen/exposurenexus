import { describe, expect, it } from "vitest";

import { AffectedResourceType } from "./affected-resource.js";
import {
  FindingStatistics,
  FindingStatus,
  createFindingSchema,
  updateFindingSchema,
} from "./finding.js";
import { VulnerabilitySeverity } from "./vulnerability.js";

const assetId = "447b53a7-c3ce-4a0c-b96a-099f5e5dc71c";

describe("finding statistics schema", () => {
  const statistics = {
    total: 1,
    status: Object.fromEntries(Object.values(FindingStatus).map((status) => [status, 0])),
    severity: Object.fromEntries(
      Object.values(VulnerabilitySeverity).map((severity) => [severity, 0]),
    ),
    assets: { [assetId]: 1 },
  };

  it("contains only finding-owned aggregate dimensions", () => {
    expect(FindingStatistics.parse(statistics)).toEqual(statistics);
    expect(() => FindingStatistics.parse({ ...statistics, source: { nuclei: 1 } })).toThrow();
  });
});

describe("manual finding creation schema", () => {
  it("defaults optional workflow, catalog, and observation values", () => {
    expect(
      createFindingSchema.parse({
        assetId,
        title: "Exposed admin panel",
        severity: VulnerabilitySeverity.High,
        status: FindingStatus.Active,
        weakness: {},
        affectedResource: { type: AffectedResourceType.Unspecified },
      }),
    ).toMatchObject({
      assetId,
      assigneeId: null,
      dueDate: null,
      mitigation: null,
      weakness: { identifiers: {} },
      affectedResource: { type: AffectedResourceType.Unspecified },
      vulnerabilityIds: [],
    });
  });

  it("keeps observation customization separate from canonical finding identity", () => {
    const parsed = createFindingSchema.parse({
      assetId,
      title: "Exposed admin panel",
      severity: VulnerabilitySeverity.High,
      status: FindingStatus.Active,
      weakness: { identifiers: { cwe: ["cwe-200"] } },
      affectedResource: { type: AffectedResourceType.Unspecified },
      vulnerabilityIds: [
        "9d7acdd0-fad1-46c9-8218-1793f421f0fe",
        "9d7acdd0-fad1-46c9-8218-1793f421f0fe",
      ],
      observation: {
        evidence: "GET /admin returned 200",
        affectedResource: {
          type: AffectedResourceType.WebEndpoint,
          reportedUrl: "https://EXAMPLE.com:443/admin",
          scheme: "HTTPS",
          host: "EXAMPLE.com",
          path: "/admin",
        },
      },
    });

    expect(parsed.vulnerabilityIds).toHaveLength(1);
    expect(parsed.weakness).toEqual({ identifiers: { cwe: ["CWE-200"] } });
    expect(parsed.affectedResource).toEqual({ type: AffectedResourceType.Unspecified });
    expect(parsed.observation?.affectedResource).toMatchObject({
      type: AffectedResourceType.WebEndpoint,
      reportedUrl: "https://EXAMPLE.com:443/admin",
      scheme: "HTTPS",
      host: "EXAMPLE.com",
      path: "/admin",
    });
  });

  it("rejects source-snapshot fields on the canonical finding resource", () => {
    expect(() =>
      createFindingSchema.parse({
        assetId,
        title: "Exposed admin panel",
        severity: VulnerabilitySeverity.High,
        status: FindingStatus.Active,
        weakness: {},
        affectedResource: {
          type: AffectedResourceType.WebEndpoint,
          reportedUrl: "https://example.com/admin",
        },
      }),
    ).toThrow();
  });
});

describe("finding correction schema", () => {
  it("accepts each finding-owned mutable field independently", () => {
    expect(updateFindingSchema.parse({ title: "Corrected title" })).toEqual({
      title: "Corrected title",
    });
    expect(
      updateFindingSchema.parse({
        weakness: { identifiers: { cwe: ["cwe-89"] } },
        affectedResource: {
          type: AffectedResourceType.SourceCode,
          repository: "https://github.com/example/repository.git",
          file: "src/query.ts",
        },
      }),
    ).toEqual({
      weakness: { identifiers: { cwe: ["CWE-89"] } },
      affectedResource: {
        type: AffectedResourceType.SourceCode,
        repository: "https://github.com/example/repository.git",
        file: "src/query.ts",
      },
    });
  });

  it("rejects empty corrections and immutable projection fields", () => {
    expect(() => updateFindingSchema.parse({})).toThrow();
    expect(() => updateFindingSchema.parse({ assetId })).toThrow();
    expect(() => updateFindingSchema.parse({ observationCount: 0 })).toThrow();
    expect(() => updateFindingSchema.parse({ vulnerabilities: [] })).toThrow();
    expect(() => updateFindingSchema.parse({ createdAt: new Date() })).toThrow();
  });

  it("rejects observation-only fields on corrected canonical resources", () => {
    expect(() =>
      updateFindingSchema.parse({
        affectedResource: {
          type: AffectedResourceType.WebEndpoint,
          reportedUrl: "https://example.com/admin",
        },
      }),
    ).toThrow();
  });
});
