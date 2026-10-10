import { AffectedResourceType } from "@exposurenexus/contracts/model/affected-resource";
import { FindingStatus } from "@exposurenexus/contracts/model/finding";
import { VulnerabilitySeverity } from "@exposurenexus/contracts/model/vulnerability";
import { describe, expect, it } from "vitest";

import {
  buildCreateFindingPayload,
  buildFindingCorrection,
  optionalNumberValue,
  optionalStringValue,
  updateResourceLocation,
} from "@/features/findings/lib/finding-form.ts";
import { SEED_ASSETS, SEED_FINDINGS, SEED_VULNERABILITIES } from "@/mocks/fixtures/index.ts";

import type { SourceCodeResource } from "@/features/findings/lib/finding-form.ts";
import type { CreateManualFinding } from "@exposurenexus/contracts/model/finding";

const values: Omit<CreateManualFinding, "weakness"> = {
  assetId: SEED_ASSETS[0].id,
  title: "  SQL injection  ",
  severity: VulnerabilitySeverity.High,
  status: FindingStatus.Active,
  assigneeId: null,
  dueDate: null,
  mitigation: null,
  affectedResource: { type: AffectedResourceType.Unspecified },
  vulnerabilityIds: [],
};

describe("buildCreateFindingPayload", () => {
  it("trims the title and keeps a null due date and assignee", () => {
    expect(buildCreateFindingPayload({ ...values }, "")).toEqual({
      payload: expect.objectContaining({
        title: "SQL injection",
        dueDate: null,
        assigneeId: null,
        weakness: { identifiers: {} },
      }),
    });
  });

  it("deduplicates catalog IDs", () => {
    const [first, second] = SEED_VULNERABILITIES;
    const result = buildCreateFindingPayload(
      { ...values, vulnerabilityIds: [first.id, second.id, first.id] },
      "",
    );

    expect(result.payload?.vulnerabilityIds).toEqual([first.id, second.id]);
  });

  it("reports the first schema issue with its path", () => {
    expect(buildCreateFindingPayload({ ...values, vulnerabilityIds: ["not-a-uuid"] }, "")).toEqual({
      error: expect.stringMatching(/^Unable to create finding\. vulnerabilityIds\.0: /),
    });
    expect(buildCreateFindingPayload({ ...values, title: "   " }, "").error).toMatch(
      /^Unable to create finding\. title: /,
    );
  });

  it("parses and canonicalizes the weakness text", () => {
    const result = buildCreateFindingPayload({ ...values }, "cwe=CWE-89, cwe-89; owasp=A03");

    expect(result.payload?.weakness.identifiers).toEqual({
      cwe: ["CWE-89"],
      owasp: ["A03"],
    });
  });

  it("rejects weakness text that is not namespace=identifier entries", () => {
    expect(buildCreateFindingPayload({ ...values }, "cwe")).toEqual({
      error: "Weakness identifiers must use namespace=identifier entries.",
    });
  });

  it("keeps the affected resource and initial observation", () => {
    const affectedResource = {
      type: AffectedResourceType.SourceCode,
      repository: "github.com/exposurenexus/api",
      file: "src/db.ts",
      location: { startLine: 12, endLine: 14 },
    } as const;
    const observation = { title: "Seen in review", observedAt: new Date("2026-01-05T00:00:00Z") };

    expect(
      buildCreateFindingPayload({ ...values, affectedResource, observation }, "").payload,
    ).toMatchObject({ affectedResource, observation });
  });
});

describe("buildFindingCorrection", () => {
  const [finding] = SEED_FINDINGS;
  const draft = {
    title: finding.title,
    severity: finding.severity,
    status: finding.status,
    assigneeId: finding.assigneeId,
    dueDate: finding.dueDate,
    mitigation: finding.mitigation,
    weakness: { ...finding.weakness, references: ["https://cwe.mitre.org/data/definitions/284"] },
    affectedResource: finding.affectedResource,
  };

  it("replaces identifiers and keeps the other weakness fields", () => {
    const result = buildFindingCorrection(draft, "cwe=CWE-285");

    expect(result.payload?.weakness).toEqual({
      identifiers: { cwe: ["CWE-285"] },
      references: draft.weakness.references,
    });
    expect(result.payload).toMatchObject({ title: finding.title, status: finding.status });
  });

  it("reports weakness syntax and schema errors", () => {
    expect(buildFindingCorrection(draft, "=CWE-1").error).toBe(
      "Weakness identifiers must use namespace=identifier entries.",
    );
    expect(buildFindingCorrection({ ...draft, title: "" }, "").error).toMatch(
      /^Unable to save correction\. title: /,
    );
  });
});

describe("resource field values", () => {
  it("treats blank input as absent", () => {
    expect(optionalStringValue("  api  ")).toBe("api");
    expect(optionalStringValue("   ")).toBeUndefined();
    expect(optionalNumberValue(" 443 ")).toBe(443);
    expect(optionalNumberValue("")).toBeUndefined();
  });

  it("drops the whole source location once the start line is cleared", () => {
    const resource: SourceCodeResource = {
      type: AffectedResourceType.SourceCode,
      file: "src/db.ts",
      location: { startLine: 12, startColumn: 3, endLine: 14 },
    };

    expect(updateResourceLocation(resource, "endColumn", "9").location).toEqual({
      startLine: 12,
      startColumn: 3,
      endLine: 14,
      endColumn: 9,
    });
    expect(updateResourceLocation(resource, "endLine", "").location).toEqual({
      startLine: 12,
      startColumn: 3,
    });
    expect(updateResourceLocation(resource, "startLine", "").location).toBeUndefined();
    expect(
      updateResourceLocation({ type: AffectedResourceType.SourceCode }, "endLine", "5").location,
    ).toBeUndefined();
  });
});
