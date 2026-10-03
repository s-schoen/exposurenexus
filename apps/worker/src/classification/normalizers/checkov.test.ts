import { readFileSync } from "node:fs";

import { weaknessSchema } from "@exposurenexus/backend/findings";
import { observationAffectedResourceSchema } from "@exposurenexus/contracts/model/affected-resource";
import { describe, expect, it, vi } from "vitest";

import { Classifier } from "../classifier.js";
import { CheckovNormalizer } from "./checkov.js";
import { renderCodeBlock, renderEvidenceSection } from "./shared.js";

import type { Logger } from "pino";

const normalizer = new CheckovNormalizer();
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const finding = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  check_id: "CKV_CUSTOM_1",
  file_path: "/modules/main.tf",
  check_result: { result: "FAILED" },
  ...overrides,
});
const report = (failed_checks: unknown[] = [finding()], context: Record<string, unknown> = {}) => ({
  check_type: "terraform",
  results: { failed_checks },
  ...context,
});
function logger() {
  return { warn: vi.fn(), info: vi.fn(), debug: vi.fn() };
}
async function normalize(raw: unknown) {
  const log = logger();
  const candidates = await normalizer.normalize(bytes(raw), log as unknown as Logger);
  return { candidates, log };
}

describe("CheckovNormalizer Terraform fixture", () => {
  it("retains all 467 failed checks directly and through the classifier without clipping or enrichment", async () => {
    const input = readFileSync(new URL("./fixtures/checkov.json", import.meta.url));
    const original = Buffer.from(input);
    const raw = JSON.parse(input.toString("utf8")) as {
      check_type: string;
      summary: Record<string, unknown>;
      results: {
        passed_checks: unknown[];
        failed_checks: Array<
          Record<string, unknown> & {
            check_id: string;
            bc_check_id: string;
            check_name: string;
            guideline: string;
            file_path: string;
            file_line_range: [number, number];
            resource: string;
            code_block: [number, string][];
          }
        >;
      };
    };
    const log = logger();
    const direct = await normalizer.normalize(input, log as unknown as Logger);
    const classifier = new Classifier(log as unknown as Logger);
    classifier.registerNormalizer("checkov", normalizer);
    const classified = await classifier.normalize("checkov", input);
    const { results, ...document } = raw;

    expect(results.passed_checks).toHaveLength(196);
    expect(results.failed_checks).toHaveLength(467);
    expect(raw.summary).toMatchObject({ failed: 467, passed: 196, resource_count: 133 });
    for (const candidates of [direct, classified]) {
      expect(candidates).toHaveLength(467);
      for (const [index, candidate] of candidates.entries()) {
        const result = results.failed_checks[index];
        expect(candidate).toEqual({
          source: "checkov",
          sourceRecord: `/results/failed_checks/${index}`,
          title: result.check_name,
          description: null,
          remediation: null,
          evidence: renderEvidenceSection(
            "Code",
            result.code_block.map(([, text]) => text).join(""),
          ),
          severity: "info",
          weakness: {
            identifiers: { checkov: [result.check_id], bridgecrew: [result.bc_check_id] },
            references: [result.guideline],
          },
          affectedResource: {
            type: "sourceCode",
            file: result.file_path,
            location: { startLine: result.file_line_range[0], endLine: result.file_line_range[1] },
            symbol: result.resource,
          },
          observedAt: null,
          assetIdentifierCandidates: [],
          sourceMetadata: { provenance: { result, document } },
        });
        expect(
          observationAffectedResourceSchema.safeParse(candidate.affectedResource).success,
        ).toBe(true);
        expect(weaknessSchema.safeParse(candidate.weakness).success).toBe(true);
      }
    }
    expect(results.failed_checks.some((result) => result.code_block.length > 100)).toBe(true);
    expect(JSON.stringify(results.failed_checks)).toContain('"entity":');
    expect(JSON.stringify(results.failed_checks)).toContain('"breadcrumbs":');
    const symbolsByRule = new Map<string, Set<string>>();
    for (const result of results.failed_checks) {
      const symbols = symbolsByRule.get(result.check_id) ?? new Set<string>();
      symbols.add(result.resource);
      symbolsByRule.set(result.check_id, symbols);
    }
    expect([...symbolsByRule.values()].some((symbols) => symbols.size > 1)).toBe(true);
    expect(direct[0].evidence).toContain(
      'resource "alicloud_oss_bucket" "bad_bucket" {\n  # Public and writeable bucket \n',
    );
    expect(direct[0].affectedResource).toEqual({
      type: "sourceCode",
      file: "/alicloud/bucket.tf",
      location: { startLine: 1, endLine: 18 },
      symbol: "alicloud_oss_bucket.bad_bucket",
    });
    expect(log.warn).not.toHaveBeenCalled();
    expect(input.equals(original)).toBe(true);
  });
});

// Constructed from the shared upstream record shape, not captured framework scans.
describe("CheckovNormalizer other frameworks", () => {
  const checkTypes = [
    "ansible",
    "argo_workflows",
    "arm",
    "azure_pipelines",
    "bicep",
    "bitbucket_configuration",
    "bitbucket_pipelines",
    "circleci_pipelines",
    "cloudformation",
    "dockerfile",
    "github_actions",
    "github_configuration",
    "gitlab_ci",
    "gitlab_configuration",
    "helm",
    "json",
    "kubernetes",
    "kustomize",
    "openapi",
    "secrets",
    "serverless",
    "terraform",
    "terraform_json",
    "terraform_plan",
    "yaml",
  ];

  it.each(checkTypes)(
    "accepts %s through the classifier with shared mapping and validation",
    async (check_type) => {
      const record = finding({ resource: "reported.resource", bc_check_id: null });
      const other = finding({ check_id: "CKV_CUSTOM_2" });
      const document = { check_type, extension: { retained: true } };
      const raw = report([], {
        ...document,
        results: {
          failed_checks: [record, other, record],
          passed_checks: [finding()],
          skipped_checks: [finding()],
        },
      });
      const log = logger();
      const classifier = new Classifier(log as unknown as Logger);
      classifier.registerNormalizer("checkov", normalizer);
      const candidates = await classifier.normalize("checkov", bytes(raw));
      expect(candidates).toEqual((await normalize(raw)).candidates);
      expect(candidates).toHaveLength(3);
      for (const [index, result] of [record, other, record].entries()) {
        expect(candidates[index]).toMatchObject({
          source: "checkov",
          sourceRecord: `/results/failed_checks/${index}`,
          title: result.check_id,
          weakness: { identifiers: { checkov: [result.check_id] } },
          assetIdentifierCandidates: [],
          observedAt: null,
          sourceMetadata: { provenance: { result, document } },
        });
        expect(candidates[index].affectedResource).toEqual({
          type: "sourceCode",
          file: result.file_path,
          ...(check_type !== "secrets" && result.resource ? { symbol: result.resource } : {}),
        });
      }
      expect(log.warn).not.toHaveBeenCalled();
      expect((await normalize(report([], { check_type }))).candidates).toEqual([]);
      for (const invalid of [
        finding({ check_id: null }),
        finding({ file_path: " " }),
        finding({ check_result: { result: "PASSED" } }),
      ]) {
        await expect(
          classifier.normalize("checkov", bytes(report([record, invalid], { check_type }))),
        ).rejects.toThrow("/results/failed_checks/1/");
      }
    },
  );

  it.each([
    "sca_package",
    "sca_image",
    "sast",
    "sast_rust",
    "cdk",
    "cdk_java",
    "3d_policy",
    "SECRET-unknown",
    "constructor",
    "Terraform",
  ])("rejects unsupported %s even when empty", async (check_type) => {
    for (const records of [[], [finding()]]) {
      await expect(normalize(report(records, { check_type }))).rejects.toEqual(
        new Error("checkov: input contains no supported reports"),
      );
    }
  });

  it.each(["cloudformation", "kubernetes"])(
    "recovers optional %s coordinates without losing neighboring fields",
    async (check_type) => {
      for (const file_line_range of [
        undefined,
        null,
        [0, 0],
        [-1, -1],
        [null, 4],
        ["bad", 4],
        [3, -1],
      ]) {
        const record = finding({
          file_path: "/template.yaml",
          file_line_range,
          bc_check_id: null,
          resource: "Service.example",
          severity: "HIGH",
          guideline: "https://example.test/rule",
        });
        const classifier = new Classifier(logger() as unknown as Logger);
        classifier.registerNormalizer("checkov", normalizer);
        const candidates = await classifier.normalize(
          "checkov",
          bytes(report([record], { check_type })),
        );
        expect(candidates).toHaveLength(1);
        expect(candidates[0].affectedResource).toEqual({
          type: "sourceCode",
          file: "/template.yaml",
          symbol: "Service.example",
          ...(file_line_range?.[0] === 3 ? { location: { startLine: 3 } } : {}),
        });
        expect(
          observationAffectedResourceSchema.safeParse(candidates[0].affectedResource).success,
        ).toBe(true);
        expect(candidates[0].severity).toBe("high");
        expect(candidates[0].weakness).toEqual({
          identifiers: { checkov: [record.check_id] },
          references: [record.guideline],
        });
        expect(candidates[0].sourceMetadata).toEqual({
          provenance: { result: JSON.parse(JSON.stringify(record)), document: { check_type } },
        });
      }
    },
  );

  it.each([
    "dockerfile",
    "github_actions",
    "gitlab_ci",
    "helm",
    "kustomize",
    "terraform_plan",
    "secrets",
  ])(
    "retains %s extension context and reported definition through the classifier",
    async (check_type) => {
      for (const file_path of check_type === "terraform_plan"
        ? ["/tfplan.json", "/modules/main.tf"]
        : ["/definition.yaml"]) {
        const text = '  token: "********"\n';
        const record = finding({
          file_path,
          file_line_range: [7, 9],
          resource: "opaque-resource-hash",
          caller_file_path: "/caller.yaml",
          caller_file_line_range: [1, 2],
          check_name: "Reported title",
          severity: "HIGH",
          guideline: "https://example.test/rule",
          code_block: [[7, text]],
          check_result: {
            result: "FAILED",
            results_configuration: { instruction: ["RUN", "command"] },
          },
          entity: { properties: { enabled: [false] } },
          evaluations: { enabled: false },
          workflow: { name: "CI", on: { push: { branches: ["main"] } } },
          job: { build: { steps: [{ run: "command" }] } },
          triggers: [{ push: {} }],
          validation_status: "valid",
          added_date: "2026-01-01",
          removed_date: "2026-02-01",
          extension: { nested: [null, { untouched: true }] },
        });
        const log = logger();
        const classifier = new Classifier(log as unknown as Logger);
        classifier.registerNormalizer("checkov", normalizer);
        const candidates = await classifier.normalize(
          "checkov",
          bytes(report([record], { check_type })),
        );
        expect(candidates).toHaveLength(1);
        expect(candidates[0]).toMatchObject({
          title: "Reported title",
          severity: "high",
          observedAt: null,
          assetIdentifierCandidates: [],
          evidence: renderEvidenceSection("Code", text),
        });
        expect(candidates[0].weakness).toEqual({
          identifiers: { checkov: [record.check_id] },
          references: [record.guideline],
        });
        expect(candidates[0].affectedResource).toEqual({
          type: "sourceCode",
          file: file_path,
          location: { startLine: 7, endLine: 9 },
          ...(check_type === "secrets" ? {} : { symbol: record.resource }),
        });
        expect(
          observationAffectedResourceSchema.safeParse(candidates[0].affectedResource).success,
        ).toBe(true);
        expect(candidates[0].sourceMetadata).toEqual({
          provenance: { result: record, document: { check_type } },
        });
        expect(log.warn).not.toHaveBeenCalled();
      }
    },
  );
});

// Constructed from the upstream SastRecord shape and SAST runner tests, not captured scans:
// Prisma Cloud SAST only runs with a platform API key.
describe("CheckovNormalizer SAST and CDK reports", () => {
  const sastRecord = (overrides: Record<string, unknown> = {}) =>
    finding({
      check_id: "CKV3_SAST_11",
      check_name: "Ensure superuser port is not set",
      file_path: "fail.py",
      file_abs_path: "/scan/src/external_check/fail.py",
      repo_file_path: "/src/external_check/fail.py",
      file_line_range: [2, 2],
      code_block: [[2, "set_port(443)\n"]],
      resource: "",
      evaluations: {},
      check_class: "",
      severity: "MEDIUM",
      bc_check_id: null,
      cwe: ["CWE-289: Authentication Bypass by Alternate Name"],
      owasp: ["A07:2021 - Identification and Authentication Failures"],
      show_severity: true,
      metadata: {
        taint_mode: {
          data_flow: [
            {
              path: "/scan/src/external_check/fail.py",
              start: { row: 2, column: 0 },
              end: { row: 2, column: 13 },
              code_block: "set_port(443)",
            },
          ],
        },
      },
      ...overrides,
    });

  it.each([
    "cdk_python",
    "cdk_typescript",
    "sast_golang",
    "sast_java",
    "sast_javascript",
    "sast_python",
    "sast_typescript",
  ])(
    "maps %s records with their relative file and CWE through the classifier",
    async (check_type) => {
      const record = sastRecord();
      const log = logger();
      const classifier = new Classifier(log as unknown as Logger);
      classifier.registerNormalizer("checkov", normalizer);
      const candidates = await classifier.normalize(
        "checkov",
        bytes(report([record], { check_type })),
      );
      expect(candidates).toEqual([
        {
          source: "checkov",
          sourceRecord: "/results/failed_checks/0",
          title: record.check_name,
          description: null,
          remediation: null,
          evidence: renderEvidenceSection("Code", "set_port(443)\n"),
          severity: "medium",
          weakness: { identifiers: { checkov: ["CKV3_SAST_11"], cwe: ["CWE-289"] } },
          affectedResource: {
            type: "sourceCode",
            file: "/src/external_check/fail.py",
            location: { startLine: 2, endLine: 2 },
          },
          observedAt: null,
          assetIdentifierCandidates: [],
          sourceMetadata: { provenance: { result: record, document: { check_type } } },
        },
      ]);
      expect(
        observationAffectedResourceSchema.safeParse(candidates[0].affectedResource).success,
      ).toBe(true);
      expect(log.warn).not.toHaveBeenCalled();
    },
  );

  it("canonicalizes CWE labels and recovers unusable CWE values independently", async () => {
    for (const { cwe, expected, warnings } of [
      { cwe: undefined, expected: undefined, warnings: 0 },
      { cwe: null, expected: undefined, warnings: 0 },
      { cwe: " ", expected: undefined, warnings: 0 },
      { cwe: "CWE-079: Cross-site Scripting", expected: ["CWE-79"], warnings: 0 },
      {
        cwe: ["CWE-89", "cwe-0089: SQL Injection", "CWE-22"],
        expected: ["CWE-22", "CWE-89"],
        warnings: 0,
      },
      { cwe: ["SECRET-label", 42, null, " ", "CWE-89"], expected: ["CWE-89"], warnings: 4 },
      { cwe: 42, expected: undefined, warnings: 1 },
      { cwe: { id: "CWE-89" }, expected: undefined, warnings: 1 },
    ]) {
      const record = sastRecord({ cwe });
      const log = logger();
      const classifier = new Classifier(log as unknown as Logger);
      classifier.registerNormalizer("checkov", normalizer);
      const candidates = await classifier.normalize(
        "checkov",
        bytes(report([record], { check_type: "sast_python" })),
      );
      expect(candidates).toHaveLength(1);
      expect(candidates[0].weakness).toEqual({
        identifiers: { checkov: [record.check_id], ...(expected ? { cwe: expected } : {}) },
      });
      expect(log.warn.mock.calls).toEqual(
        Array.from({ length: warnings }, () => [
          { sourceRecord: "/results/failed_checks/0", field: "cwe" },
          "checkov: ignoring unusable optional value",
        ]),
      );
      expect(JSON.stringify(log.warn.mock.calls)).not.toContain("SECRET");
    }
  });

  it("falls back to the reported file name when the relative SAST path is unusable", async () => {
    for (const [repo_file_path, warned] of [
      [undefined, false],
      [null, false],
      [" ", false],
      [42, true],
    ] as const) {
      const { candidates, log } = await normalize(
        report([sastRecord({ repo_file_path })], { check_type: "cdk_typescript" }),
      );
      expect(candidates[0].affectedResource).toEqual({
        type: "sourceCode",
        file: "fail.py",
        location: { startLine: 2, endLine: 2 },
      });
      expect(log.warn.mock.calls).toEqual(
        warned
          ? [
              [
                { sourceRecord: "/results/failed_checks/0", field: "repo_file_path" },
                "checkov: ignoring unusable optional value",
              ],
            ]
          : [],
      );
    }
  });

  it("keeps SAST-only fields in provenance for other frameworks", async () => {
    const record = sastRecord({ resource: "aws_instance.example" });
    const { candidates, log } = await normalize(report([record]));
    expect(candidates).toHaveLength(1);
    expect(candidates[0].weakness).toEqual({ identifiers: { checkov: [record.check_id] } });
    expect(candidates[0].affectedResource).toEqual({
      type: "sourceCode",
      file: "fail.py",
      location: { startLine: 2, endLine: 2 },
      symbol: "aws_instance.example",
    });
    expect(candidates[0].sourceMetadata).toEqual({
      provenance: { result: record, document: { check_type: "terraform" } },
    });
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("imports SAST findings alongside IaC findings and skips other unsupported reports", async () => {
    const raw = [
      report(),
      { check_type: "sca_package" },
      report([sastRecord()], { check_type: "sast_java" }),
    ];
    const { candidates, log } = await normalize(raw);
    expect(candidates.map(({ sourceRecord }) => sourceRecord)).toEqual([
      "/0/results/failed_checks/0",
      "/2/results/failed_checks/0",
    ]);
    expect(candidates[1].affectedResource).toMatchObject({ file: "/src/external_check/fail.py" });
    expect(log.warn.mock.calls).toEqual([
      [{ sourceRecord: "/1", count: 1 }, "checkov: skipping unsupported report"],
    ]);
  });
});

describe("CheckovNormalizer bundles and scan outcomes", () => {
  const emptySummary = {
    checkov_version: "3.2.360",
    passed: 0,
    failed: 0,
    skipped: 0,
    parsing_errors: 0,
    resource_count: 0,
  };

  it("preserves mapping, duplicates, original indexes, and canonical identifiers across bundles", async () => {
    const first = report([finding({ check_id: " CKV_CUSTOM_1 " }), finding()]);
    const last = report([finding({ resource: "opaque" })], { check_type: "secrets" });
    const raw = [first, { check_type: "SECRET-unsupported" }, first, last];
    const { candidates, log } = await normalize(raw);
    const expected = [];
    for (const [index, item] of [
      [0, first],
      [2, first],
      [3, last],
    ] as const) {
      expected.push(
        ...(await normalize(item)).candidates.map((candidate) => ({
          ...candidate,
          sourceRecord: `/${index}${candidate.sourceRecord}`,
        })),
      );
    }
    expect(candidates).toEqual(expected);
    expect(log.warn.mock.calls).toEqual([
      [{ sourceRecord: "/1", count: 1 }, "checkov: skipping unsupported report"],
    ]);
    const classifier = new Classifier(log as unknown as Logger);
    classifier.registerNormalizer("checkov", normalizer);
    expect(await classifier.normalize("checkov", bytes(raw))).toEqual(
      expected.map((candidate) => ({
        ...candidate,
        weakness: weaknessSchema.parse(candidate.weakness),
      })),
    );
    expect(JSON.stringify(log.warn.mock.calls)).not.toContain("SECRET");
    expect((await normalize([first])).candidates).toEqual(expected.slice(0, 2));
  });

  it("warns for every unsupported report, including empty ones, but accepts supported empty reports", async () => {
    const unsupported = report([], { check_type: "SECRET-type" });
    const log = logger();
    await expect(
      normalizer.normalize(bytes([unsupported, unsupported]), log as unknown as Logger),
    ).rejects.toThrow("no supported reports");
    expect(log.warn).toHaveBeenCalledTimes(2);
    const result = await normalize([unsupported, report([]), unsupported]);
    expect(result.candidates).toEqual([]);
    expect(result.log.warn.mock.calls.map(([fields]) => fields)).toEqual([
      { sourceRecord: "/0", count: 1 },
      { sourceRecord: "/2", count: 1 },
    ]);
    expect(JSON.stringify(log.warn.mock.calls)).not.toContain("SECRET");
  });

  it("rejects later malformed reports atomically with safe indexed errors", async () => {
    for (const invalid of [
      null,
      [],
      "SECRET-report",
      42,
      {},
      emptySummary,
      ...[undefined, null, 42, "", " ", {}].map((check_type) => report([], { check_type })),
      report([], { results: null }),
      report([], { results: { failed_checks: "SECRET-value" } }),
      report([finding(), finding({ check_id: "" })]),
    ]) {
      const error = await normalize([report(), invalid]).catch((reason: unknown) => reason);
      expect(error).toBeInstanceOf(Error);
      expect(String(error)).toContain("/1");
      expect(String(error)).not.toContain("SECRET");
    }
  });

  it("accepts quiet and compact reports without fabricating evidence or dropping context", async () => {
    const record = finding({ code_block: null, connected_node: null });
    const { candidates, log } = await normalize(report([record]));
    expect(candidates).toHaveLength(1);
    expect(candidates[0].evidence).toBeNull();
    expect(candidates[0].sourceMetadata).toEqual({
      provenance: { result: record, document: { check_type: "terraform" } },
    });
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("recognizes only complete root-level zero summaries", async () => {
    expect((await normalize(emptySummary)).candidates).toEqual([]);
    for (const field of ["passed", "failed", "skipped", "parsing_errors", "resource_count"]) {
      for (const value of [undefined, null, "0", 1, -1, false, [], {}]) {
        await expect(normalize({ ...emptySummary, [field]: value })).rejects.toThrow("checkov:");
      }
    }
    for (const checkov_version of [undefined, null, "", " ", 42]) {
      await expect(normalize({ ...emptySummary, checkov_version })).rejects.toThrow("checkov:");
    }
    for (const raw of [
      [],
      {},
      [emptySummary],
      { ...emptySummary, check_type: "terraform" },
      { ...emptySummary, results: null },
    ]) {
      await expect(normalize(raw)).rejects.toThrow("checkov:");
    }
  });

  it("counts scanner errors once, recovers malformed diagnostics, and never logs their contents", async () => {
    for (const failed_checks of [[], [finding()]]) {
      for (const { errors, summary, count, fields } of [
        {
          errors: ["SECRET-path", { message: "SECRET-error" }],
          summary: { parsing_errors: 9 },
          count: 2,
          fields: [],
        },
        { errors: [], summary: { parsing_errors: 9 }, count: 0, fields: [] },
        { errors: undefined, summary: { parsing_errors: 3 }, count: 3, fields: [] },
        { errors: null, summary: { parsing_errors: 3 }, count: 3, fields: [] },
        {
          errors: "SECRET-errors",
          summary: { parsing_errors: 3 },
          count: 3,
          fields: ["results/parsing_errors"],
        },
        { errors: ["SECRET-path"], summary: "SECRET-summary", count: 1, fields: ["summary"] },
        ...[-1, 1.5, "SECRET-count", {}, [], true].map((parsing_errors) => ({
          errors: undefined,
          summary: { parsing_errors },
          count: 0,
          fields: ["summary/parsing_errors"],
        })),
      ]) {
        const raw = report([], { summary, results: { failed_checks, parsing_errors: errors } });
        const { candidates, log } = await normalize([raw]);
        expect(candidates).toHaveLength(failed_checks.length);
        expect(log.warn.mock.calls).toEqual([
          ...fields.map((field) => [
            { sourceRecord: "/0", field },
            "checkov: ignoring unusable optional value",
          ]),
          ...(count > 0
            ? [[{ sourceRecord: "/0", count }, "checkov: scanner reported parsing errors"]]
            : []),
        ]);
        expect(JSON.stringify(log.warn.mock.calls)).not.toContain("SECRET");
        for (const candidate of candidates) {
          expect(candidate.sourceMetadata).toEqual({
            provenance: {
              result: failed_checks[0],
              document: { check_type: "terraform", summary },
            },
          });
        }
      }
    }
  });
});

describe("CheckovNormalizer required input", () => {
  it.each(["", " \n\t", '{"SECRET-key":', "SECRET-not-json"])(
    "rejects invalid JSON safely (%#)",
    async (text) => {
      await expect(
        normalizer.normalize(new TextEncoder().encode(text), logger() as unknown as Logger),
      ).rejects.toEqual(new Error("checkov: invalid JSON or UTF-8"));
    },
  );

  it("rejects invalid UTF-8 inside otherwise valid JSON", async () => {
    const input = Buffer.concat([
      Buffer.from('{"check_type":"terraform","results":{"failed_checks":[]},"unknown":"'),
      Buffer.from([0xff]),
      Buffer.from('"}'),
    ]);
    await expect(normalizer.normalize(input, logger() as unknown as Logger)).rejects.toEqual(
      new Error("checkov: invalid JSON or UTF-8"),
    );
  });

  it.each([
    null,
    [],
    "SECRET-root",
    42,
    true,
    {},
    { results: { failed_checks: [] } },
    ...[null, {}, [], 42, true, "", " \n\t"].map((check_type) => report([], { check_type })),
    ...[undefined, null, [], "SECRET-results", 42, true].map((results) => report([], { results })),
    ...[undefined, null, {}, "SECRET-failures", 42, true].map((failed_checks) =>
      report([], { results: { failed_checks } }),
    ),
  ])("rejects unusable single-report envelopes with ordinary safe errors (%#)", async (raw) => {
    const error = await normalize(raw).then(
      () => undefined,
      (reason: unknown) => reason,
    );
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).constructor).toBe(Error);
    expect(String(error)).toContain("checkov:");
    expect(String(error)).not.toContain("SECRET");
  });

  it("accepts empty Terraform reports regardless of scanner version", async () => {
    for (const checkov_version of [undefined, null, "future-version", { unknown: true }]) {
      const { candidates, log } = await normalize(report([], { summary: { checkov_version } }));
      expect(candidates).toEqual([]);
      expect(log.warn).not.toHaveBeenCalled();
    }
  });

  it.each([null, [], "SECRET-record", 42, true].map((value) => [value]))(
    "rejects a late non-object record atomically (%#)",
    async (invalid) => {
      await expect(normalize(report([finding(), invalid]))).rejects.toThrow(
        /\/results\/failed_checks\/1/,
      );
    },
  );

  it.each(["check_id", "file_path"])(
    "rejects late malformed required %s without leaking records",
    async (field) => {
      for (const value of [undefined, null, [], {}, "", " \n\t", 42, true]) {
        const raw = report([
          finding({ check_id: "SECRET-rule", file_path: "SECRET-path" }),
          finding({ [field]: value }),
        ]);
        const error = await normalize(raw).then(
          () => undefined,
          (reason: unknown) => reason,
        );
        expect(error).toBeInstanceOf(Error);
        expect(String(error)).toContain(`/results/failed_checks/1/${field}`);
        expect(String(error)).not.toContain("SECRET");
      }
    },
  );

  it.each(
    [
      undefined,
      null,
      [],
      "SECRET-status",
      42,
      true,
      {},
      ...[undefined, null, "PASSED", "SKIPPED", "failed", "SECRET-result", 42].map((result) => ({
        result,
      })),
    ].map((value) => [value]),
  )("rejects missing or contradictory late failed status atomically (%#)", async (check_result) => {
    const error = await normalize(report([finding(), finding({ check_result })])).then(
      () => undefined,
      (reason: unknown) => reason,
    );
    expect(error).toBeInstanceOf(Error);
    expect(String(error)).toContain("/results/failed_checks/1");
    expect(String(error)).not.toContain("SECRET");
  });

  it("preserves order and duplicate failures while ignoring sibling collections", async () => {
    const first = finding({ check_id: "CKV_Z_2" });
    const second = finding({ check_id: "CKV_A_1" });
    const { candidates } = await normalize(
      report([], {
        results: {
          failed_checks: [first, second, first],
          passed_checks: [finding()],
          skipped_checks: [finding()],
          parsing_errors: ["SECRET-diagnostic"],
        },
      }),
    );
    expect(candidates.map((candidate) => candidate.weakness.identifiers.checkov)).toEqual([
      ["CKV_Z_2"],
      ["CKV_A_1"],
      ["CKV_Z_2"],
    ]);
    expect(candidates.map((candidate) => candidate.sourceRecord)).toEqual([
      "/results/failed_checks/0",
      "/results/failed_checks/1",
      "/results/failed_checks/2",
    ]);
  });
});

describe("CheckovNormalizer optional mapping", () => {
  it("maps the minimal record without invented identity or severity", async () => {
    const record = finding();
    const { candidates, log } = await normalize(report([record]));
    expect(candidates).toEqual([
      {
        source: "checkov",
        sourceRecord: "/results/failed_checks/0",
        title: "CKV_CUSTOM_1",
        description: null,
        remediation: null,
        evidence: null,
        severity: "info",
        weakness: { identifiers: { checkov: ["CKV_CUSTOM_1"] } },
        affectedResource: { type: "sourceCode", file: "/modules/main.tf" },
        assetIdentifierCandidates: [],
        observedAt: null,
        sourceMetadata: { provenance: { result: record, document: { check_type: "terraform" } } },
      },
    ]);
    expect(log.warn).not.toHaveBeenCalled();
  });

  it.each([undefined, null, "", " \n\t"])(
    "treats unavailable optional text as absent without warnings (%#)",
    async (value) => {
      const { candidates, log } = await normalize(
        report([
          finding({
            check_name: value,
            description: value,
            short_description: value,
            bc_check_id: value,
            guideline: value,
            resource: value,
            fixed_definition: value,
          }),
        ]),
      );
      expect(candidates[0]).toMatchObject({
        title: "CKV_CUSTOM_1",
        description: null,
        remediation: null,
      });
      expect(candidates[0].weakness).toEqual({ identifiers: { checkov: ["CKV_CUSTOM_1"] } });
      expect(candidates[0].affectedResource).toEqual({
        type: "sourceCode",
        file: "/modules/main.tf",
      });
      expect(log.warn).not.toHaveBeenCalled();
    },
  );

  it.each([
    [" full\r\n description \n", "short", " full\r\n description \n"],
    [undefined, " short \n", " short \n"],
    [null, "short", "short"],
    [" \n", "short", "short"],
    [{ bad: "SECRET" }, "short", "short"],
    ["full", { bad: "SECRET" }, "full"],
  ])(
    "uses full then short description without rewriting text (%#)",
    async (description, short_description, expected) => {
      const { candidates } = await normalize(
        report([finding({ check_name: " Human title ", description, short_description })]),
      );
      expect(candidates[0]).toMatchObject({ title: " Human title ", description: expected });
    },
  );

  it.each([
    "check_name",
    "description",
    "short_description",
    "bc_check_id",
    "guideline",
    "resource",
    "fixed_definition",
  ])(
    "recovers malformed %s independently and survives classifier canonicalization",
    async (field) => {
      for (const value of [42, true, ["SECRET-value"], { "SECRET-key": "SECRET-value" }]) {
        const record = finding({
          check_name: "Title",
          description: "Full",
          short_description: "Short",
          bc_check_id: "BC_CUSTOM_1",
          guideline: "https://example.test/rule",
          resource: "aws_s3_bucket.example",
          fixed_definition: "fixed\n",
          [field]: value,
        });
        const log = logger();
        const classifier = new Classifier(log as unknown as Logger);
        classifier.registerNormalizer("checkov", normalizer);
        const candidates = await classifier.normalize("checkov", bytes(report([record])));
        expect(candidates).toHaveLength(1);
        expect(candidates[0]).toMatchObject({
          title: field === "check_name" ? record.check_id : "Title",
          description: field === "description" ? "Short" : "Full",
          remediation:
            field === "fixed_definition"
              ? null
              : `Suggested definition:\n\n${renderCodeBlock("fixed\n")}`,
        });
        expect(candidates[0].weakness).toEqual({
          identifiers: {
            checkov: [record.check_id],
            ...(field === "bc_check_id" ? {} : { bridgecrew: ["BC_CUSTOM_1"] }),
          },
          ...(field === "guideline" ? {} : { references: ["https://example.test/rule"] }),
        });
        expect(candidates[0].affectedResource).toEqual({
          type: "sourceCode",
          file: record.file_path,
          ...(field === "resource" ? {} : { symbol: "aws_s3_bucket.example" }),
        });
        expect(log.warn).toHaveBeenCalled();
        expect(JSON.stringify(log.warn.mock.calls)).toContain(field);
        expect(JSON.stringify(log.warn.mock.calls)).not.toContain("SECRET");
        expect(candidates[0].sourceMetadata).toEqual({
          provenance: { result: record, document: { check_type: "terraform" } },
        });
      }
    },
  );

  it.each([
    ["CRITICAL", "critical"],
    ["HIGH", "high"],
    ["IMPORTANT", "high"],
    ["MEDIUM", "medium"],
    ["MODERATE", "medium"],
    ["LOW", "low"],
    ["INFO", "info"],
    ["NONE", "info"],
    ["OFF", "info"],
    [undefined, "info"],
    [null, "info"],
  ])("maps source severity %s to %s without inference", async (severity, expected) => {
    const { candidates, log } = await normalize(
      report([
        finding({
          severity,
          check_name: "Critical remote code execution",
          category: "HIGH",
          code_block: [[1, "critical = true\n"]],
        }),
      ]),
    );
    expect(candidates[0].severity).toBe(expected);
    expect(log.warn).not.toHaveBeenCalled();
  });

  it.each(
    ["SECRET-severity", "", " \n", "constructor", 42, true, [], { name: "HIGH" }].map((value) => [
      value,
    ]),
  )("warns and falls back to info for unusable severity (%#)", async (severity) => {
    const { candidates, log } = await normalize(report([finding({ severity })]));
    expect(candidates[0].severity).toBe("info");
    expect(log.warn).toHaveBeenCalled();
    expect(JSON.stringify(log.warn.mock.calls)).toContain("severity");
    expect(JSON.stringify(log.warn.mock.calls)).not.toContain("SECRET");
  });

  it("lets the classifier canonicalize identifiers and stamp the source", async () => {
    const log = logger();
    const classifier = new Classifier(log as unknown as Logger);
    classifier.registerNormalizer("checkov", {
      async normalize(input, logger) {
        return (await normalizer.normalize(input, logger)).map((candidate) => ({
          ...candidate,
          source: "unstamped",
        }));
      },
    });
    const candidates = await classifier.normalize(
      "checkov",
      bytes(
        report([
          finding({
            check_id: " CKV_CUSTOM_1 ",
            bc_check_id: " BC_CUSTOM_1 ",
            guideline: " https://example.test/rule ",
          }),
        ]),
      ),
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0].source).toBe("checkov");
    expect(candidates[0].weakness).toEqual(
      weaknessSchema.parse({
        identifiers: { checkov: [" CKV_CUSTOM_1 "], bridgecrew: [" BC_CUSTOM_1 "] },
        references: [" https://example.test/rule "],
      }),
    );
  });
});

describe("CheckovNormalizer definition location", () => {
  it.each(
    [
      [[10, 12], { startLine: 10, endLine: 12 }],
      [[10, 10], { startLine: 10, endLine: 10 }],
      [[10], { startLine: 10 }],
      [[10, 9], { startLine: 10 }],
      ...[null, 0, -1, 1.5, "SECRET-end", {}, [], true].map((end) => [
        [10, end],
        { startLine: 10 },
      ]),
      ...[null, 0, -1, 1.5, "SECRET-start", {}, [], true].map((start) => [[start, 12], undefined]),
      [undefined, undefined],
      [null, undefined],
      [[], undefined],
      ["SECRET-range", undefined],
      [{ start: 10, end: 12 }, undefined],
    ].map(([file_line_range, location]) => ({ file_line_range, location })),
  )(
    "preserves usable definition coordinates without offsets or caller fallback (%#)",
    async ({ file_line_range, location }) => {
      const record = finding({
        file_path: " /modules/../main.tf ",
        file_line_range,
        resource: " module.bucket.aws_s3_bucket.example ",
        caller_file_path: "/caller.tf",
        caller_file_line_range: [1, 3],
        file_abs_path: "/checkout/main.tf",
        repo_file_path: "different/main.tf",
        resource_address: "another.address",
      });
      const { candidates } = await normalize(report([record]));
      expect(candidates[0].affectedResource).toEqual({
        type: "sourceCode",
        file: record.file_path,
        symbol: record.resource,
        ...(location === undefined ? {} : { location }),
      });
      expect(
        observationAffectedResourceSchema.safeParse(candidates[0].affectedResource).success,
      ).toBe(true);
      expect(candidates[0].sourceMetadata).toEqual({
        provenance: { result: record, document: { check_type: "terraform" } },
      });
    },
  );
});

describe("CheckovNormalizer evidence and fixes", () => {
  it("preserves complete tuple text in source order with safe fences and explicit fixes", async () => {
    const text =
      '  masked = "********"\r\n\t```\n' + "long source line\n".repeat(2_000) + "````\r\n\n";
    const fixed_definition = "  resource {\r\n\tvalue = ```fixed```\n}\n";
    const { candidates, log } = await normalize(
      report([
        finding({
          code_block: [
            [99, text.slice(0, 20)],
            [-1, text.slice(20)],
            [0, ""],
          ],
          fixed_definition,
          guideline: "https://example.test/rule",
        }),
      ]),
    );
    expect(candidates[0].evidence).toBe(
      `<details><summary>Code</summary>\n\n\`\`\`\`\`\n${text}\n\`\`\`\`\`\n\n</details>`,
    );
    expect(candidates[0].remediation).toBe(
      `Suggested definition:\n\n${renderCodeBlock(fixed_definition)}`,
    );
    expect(candidates[0].weakness.references).toEqual(["https://example.test/rule"]);
    expect(log.warn).not.toHaveBeenCalled();
  });

  it.each([undefined, null, [], [[1, ""]]].map((value) => [value]))(
    "omits unavailable or textually empty evidence (%#)",
    async (code_block) => {
      const { candidates, log } = await normalize(
        report([finding({ code_block, guideline: "https://example.test/rule" })]),
      );
      expect(candidates[0].evidence).toBeNull();
      expect(candidates[0].remediation).toBeNull();
      expect(log.warn).not.toHaveBeenCalled();
    },
  );

  it.each(
    [
      "SECRET-code",
      {},
      42,
      true,
      [null],
      ["SECRET-code"],
      [[]],
      [[1]],
      [[1, "SECRET-code", "extra"]],
      [["1", "SECRET-code"]],
      [[null, "SECRET-code"]],
      [[1.5, "SECRET-code"]],
      [[true, "SECRET-code"]],
      [[1, null]],
      [[1, 42]],
      [[1, {}]],
      [
        [1, "valid\n"],
        [2, ["SECRET-code"]],
      ],
    ].map((value) => [value]),
  )("omits the entire malformed optional block and retains raw tuples (%#)", async (code_block) => {
    const record = finding({ code_block });
    const { candidates, log } = await normalize(report([record]));
    expect(candidates).toHaveLength(1);
    expect(candidates[0].evidence).toBeNull();
    expect(candidates[0].sourceMetadata).toEqual({
      provenance: { result: record, document: { check_type: "terraform" } },
    });
    expect(log.warn).toHaveBeenCalled();
    expect(JSON.stringify(log.warn.mock.calls)).toContain("code_block");
    expect(JSON.stringify(log.warn.mock.calls)).not.toContain("SECRET");
  });
});

describe("CheckovNormalizer provenance and log safety", () => {
  it("preserves raw context without sibling results, mutable sharing, or inferred repository identity", async () => {
    const record = finding({
      check_id: "SECRET-rule",
      file_path: "SECRET-path",
      check_name: { "SECRET-key": "SECRET-title" },
      description: ["SECRET-description"],
      severity: "SECRET-severity",
      bc_check_id: { "SECRET-alias": true },
      guideline: ["SECRET-url"],
      code_block: [
        [1, "SECRET-code"],
        [2, null],
      ],
      file_line_range: ["SECRET-start", 12],
      fixed_definition: ["SECRET-fix"],
      resource: "SECRET-symbol",
      resource_address: "SECRET-address",
      caller_file_path: "SECRET-caller",
      entity: { "SECRET-graph": [1] },
      breadcrumbs: { "SECRET-path": ["SECRET-value"] },
      tags: { repository: "SECRET-repo", revision: "SECRET-revision", timestamp: "2026-01-01" },
      unknown: ["SECRET-extension"],
    });
    const document = {
      check_type: "terraform",
      summary: { checkov_version: "future", failed: 2 },
      url: "SECRET-promotional-url",
      support_path: "SECRET-support-path",
      ["__proto__"]: { "SECRET-key": true },
      unknown: { nested: ["original"] },
    };
    const raw = report([], {
      ...document,
      results: {
        failed_checks: [record, record],
        passed_checks: ["SECRET-passed"],
        skipped_checks: ["SECRET-skipped"],
        parsing_errors: ["SECRET-diagnostic"],
      },
    });
    const input = bytes(raw);
    const original = input.slice();
    const log = logger();
    const candidates = await normalizer.normalize(input, log as unknown as Logger);
    expect(candidates).toHaveLength(2);
    for (const candidate of candidates) {
      expect(candidate.sourceMetadata).toEqual({ provenance: { result: record, document } });
      expect(candidate.affectedResource).toEqual({
        type: "sourceCode",
        file: "SECRET-path",
        symbol: "SECRET-symbol",
      });
      expect(candidate.assetIdentifierCandidates).toEqual([]);
      expect(candidate.observedAt).toBeNull();
    }
    const contexts = candidates.map(
      ({ sourceMetadata }) => (sourceMetadata.provenance as { document: typeof document }).document,
    );
    expect(contexts[0]).not.toBe(contexts[1]);
    contexts[0].unknown.nested.push("changed");
    contexts[0].summary.failed = 99;
    expect(contexts[1]).toEqual(document);
    expect(Object.hasOwn(contexts[0], "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(contexts[0])).toBe(Object.prototype);
    expect(input).toEqual(original);
    expect(log.warn).toHaveBeenCalled();
    expect(
      JSON.stringify([...log.warn.mock.calls, ...log.info.mock.calls, ...log.debug.mock.calls]),
    ).not.toContain("SECRET");
    for (const [fields] of log.warn.mock.calls) {
      expect(
        Object.keys(fields).every((key) => ["sourceRecord", "field", "count"].includes(key)),
      ).toBe(true);
      if (fields.sourceRecord !== undefined)
        expect(fields.sourceRecord).toMatch(/^(\/results\/failed_checks\/[01])?$/);
    }
  });
});
