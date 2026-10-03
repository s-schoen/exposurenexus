import { readFileSync } from "node:fs";

import { weaknessSchema } from "@exposurenexus/backend/findings";
import { observationAffectedResourceSchema } from "@exposurenexus/contracts/model/affected-resource";
import { describe, expect, it, vi } from "vitest";

import { Classifier } from "../classifier.js";
import { KicsNormalizer } from "./kics.js";
import { renderEvidenceSection } from "./shared.js";

import type { ObservationCandidate } from "../classifier.js";
import type { Logger } from "pino";

const normalizer = new KicsNormalizer();
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const occurrence = (overrides: Record<string, unknown> = {}) => ({
  file_name: "main.tf",
  ...overrides,
});
const query = (overrides: Record<string, unknown> = {}) => ({
  query_id: "custom/rule:1",
  severity: "HIGH",
  files: [occurrence()],
  ...overrides,
});
const report = (queries: unknown[] = [query()], context: Record<string, unknown> = {}) => ({
  queries,
  ...context,
});
function logger() {
  return { warn: vi.fn(), info: vi.fn(), debug: vi.fn() };
}
function provenance(candidate: ObservationCandidate) {
  return candidate.sourceMetadata.provenance as {
    document: Record<string, unknown>;
    query: Record<string, unknown>;
    result: Record<string, unknown>;
  };
}

describe.each(["direct", "classifier"] as const)("KicsNormalizer %s", (mode) => {
  async function run(input: Uint8Array, log = logger()) {
    const typedLog = log as unknown as Logger;
    const classifier = new Classifier(typedLog);
    classifier.registerNormalizer("kics", normalizer);
    const candidates = await (mode === "direct"
      ? normalizer.normalize(input, typedLog)
      : classifier.normalize("kics", input));
    for (const candidate of candidates) {
      expect(observationAffectedResourceSchema.safeParse(candidate.affectedResource).success).toBe(
        true,
      );
      expect(weaknessSchema.safeParse(candidate.weakness).success).toBe(true);
    }
    return { candidates, log };
  }
  const normalize = (raw: unknown) => run(bytes(raw));

  it("retains the complete TerraGoat fixture with every occurrence and source field", async () => {
    const input = readFileSync(new URL("./fixtures/kics.json", import.meta.url));
    const original = Buffer.from(input);
    type Result = Record<string, unknown> & {
      file_name: string;
      line: number;
      search_line: number;
      resource_name?: string;
      expected_value: string;
      actual_value: string;
      remediation?: string;
      remediation_type?: string;
      similarity_id: string;
    };
    const raw = JSON.parse(input.toString("utf8")) as {
      kics_version: string;
      end: string;
      queries: Array<
        Record<string, unknown> & {
          query_id: string;
          query_name: string;
          description: string;
          severity: string;
          cwe: string;
          query_url: string;
          files: Result[];
        }
      >;
    };
    const { queries, ...document } = raw;
    expect(raw.kics_version).toBe("v2.1.20");
    expect(queries).toHaveLength(154);
    expect(new Set(queries.map((item) => item.platform))).toEqual(new Set(["Terraform", "Common"]));
    const { candidates, log } = await run(input);
    expect(candidates).toHaveLength(302);
    const totals: Record<string, number> = {};
    const similarities = new Map<string, ObservationCandidate[]>();
    let index = 0;
    let secrets = 0;
    let differingSearchLines = 0;
    let sentinelSearchLines = 0;
    for (const [queryIndex, { files, ...context }] of queries.entries()) {
      for (const [resultIndex, result] of files.entries()) {
        const candidate = candidates[index++];
        totals[candidate.severity] = (totals[candidate.severity] ?? 0) + 1;
        expect(candidate).toEqual({
          source: "kics",
          sourceRecord: `/queries/${queryIndex}/files/${resultIndex}`,
          title: context.query_name,
          description: context.description,
          severity: context.severity.toLowerCase(),
          weakness: {
            identifiers: { kics: [context.query_id], cwe: [`CWE-${context.cwe}`] },
            references: [context.query_url],
          },
          affectedResource: {
            type: "sourceCode",
            file: result.file_name,
            location: { startLine: result.line },
            ...(result.resource_name ? { symbol: result.resource_name } : {}),
          },
          assetIdentifierCandidates: [],
          observedAt: new Date("2026-09-16T18:59:18.905Z"),
          evidence: `${renderEvidenceSection("Expected", result.expected_value)}\n\n${renderEvidenceSection("Actual", result.actual_value)}`,
          remediation: result.remediation
            ? renderEvidenceSection(
                `Suggested remediation (${result.remediation_type})`,
                result.remediation,
              )
            : null,
          sourceMetadata: { provenance: { document, query: context, result } },
        });
        expect(result.expected_value.length).toBeGreaterThan(0);
        expect(result.actual_value.length).toBeGreaterThan(0);
        if (context.query_name.startsWith("Passwords And Secrets")) {
          secrets++;
          expect(candidate.affectedResource).not.toHaveProperty("symbol");
        }
        if (result.search_line > 0 && result.search_line !== result.line) differingSearchLines++;
        if (result.search_line === -1) sentinelSearchLines++;
        const group = similarities.get(result.similarity_id) ?? [];
        group.push(candidate);
        similarities.set(result.similarity_id, group);
      }
    }
    expect(totals).toEqual({ critical: 4, high: 68, medium: 116, low: 57, info: 57 });
    expect(secrets).toBe(17);
    // The supplied bytes have no differing positive search lines; exercise that case below.
    expect(differingSearchLines).toBe(0);
    expect(sentinelSearchLines).toBeGreaterThan(0);
    expect(candidates.filter((item) => item.remediation !== null)).toHaveLength(96);
    expect(
      candidates.some(
        (item) =>
          item.remediation ===
          renderEvidenceSection(
            "Suggested remediation (addition)",
            "public_network_access_enabled = false",
          ),
      ),
    ).toBe(true);
    expect(
      candidates.some(
        (item) =>
          item.remediation ===
          renderEvidenceSection(
            "Suggested remediation (replacement)",
            '{"after":"false","before":"true"}',
          ),
      ),
    ).toBe(true);
    const duplicates = [...similarities.values()].filter((group) => group.length > 1);
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0]).toHaveLength(2);
    expect(duplicates[0][0].sourceRecord).not.toBe(duplicates[0][1].sourceRecord);
    expect(provenance(duplicates[0][0]).result).not.toEqual(provenance(duplicates[0][1]).result);
    expect(log.warn).not.toHaveBeenCalled();
    expect(input.equals(original)).toBe(true);

    const variant = structuredClone(raw);
    variant.queries[0].files[0].search_line = variant.queries[0].files[0].line + 100;
    const varied = await normalize(variant);
    expect(varied.candidates[0].affectedResource).toEqual(candidates[0].affectedResource);
    expect(provenance(varied.candidates[0]).result.search_line).toBe(
      variant.queries[0].files[0].search_line,
    );
  });

  it("maps minimal records without invented context", async () => {
    const { candidates, log } = await normalize(report());
    expect(candidates).toEqual([
      {
        source: "kics",
        sourceRecord: "/queries/0/files/0",
        title: "custom/rule:1",
        description: null,
        severity: "high",
        evidence: null,
        remediation: null,
        weakness: { identifiers: { kics: ["custom/rule:1"] } },
        affectedResource: { type: "sourceCode", file: "main.tf" },
        assetIdentifierCandidates: [],
        observedAt: null,
        sourceMetadata: {
          provenance: {
            document: {},
            query: { query_id: "custom/rule:1", severity: "HIGH" },
            result: occurrence(),
          },
        },
      },
    ]);
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("preserves duplicates, empty-array indexes, and inclusion independent of inventory/counters/version", async () => {
    const result = occurrence({ line: 3, similarity_id: "same", resource_name: "same" });
    const context = {
      kics_version: { future: true },
      total_counter: 0,
      queries_total: 0,
      severity_counters: { HIGH: 0 },
      bill_of_materials: [query()],
    };
    const { candidates } = await normalize(
      report([query({ files: [] }), query({ files: [result, result] }), query()], context),
    );
    expect(candidates.map((item) => item.sourceRecord)).toEqual([
      "/queries/1/files/0",
      "/queries/1/files/1",
      "/queries/2/files/0",
    ]);
    expect(candidates[0]).toEqual({ ...candidates[1], sourceRecord: "/queries/1/files/0" });
    expect(provenance(candidates[0]).document).not.toHaveProperty("bill_of_materials");
    for (const kics_version of [undefined, null, "future", 42, {}]) {
      expect(
        (await normalize(report([], { ...context, kics_version, total_counter: 999 }))).candidates,
      ).toEqual([]);
      expect(
        (await normalize(report([query({ files: [] })], { kics_version }))).candidates,
      ).toEqual([]);
    }
  });

  it("reports scan failures once per document, with or without detections", async () => {
    const fields = [
      "files_failed_to_scan",
      "queries_failed_to_execute",
      "queries_failed_to_compute_similarity_id",
    ];
    for (const queries of [[], [query({ files: [occurrence(), occurrence()] }), query()]]) {
      for (const failures of [
        ...fields.map((field) => ({ [field]: 2 })),
        Object.fromEntries(fields.map((field) => [field, 3])),
      ]) {
        const context = {
          ...failures,
          total_counter: 999,
          queries_total: 0,
          severity_counters: { HIGH: 0 },
          lines_ignored: 7,
        };
        const { candidates, log } = await normalize(report(queries, context));
        expect(candidates.map((candidate) => candidate.sourceRecord)).toEqual(
          queries.length === 0
            ? []
            : ["/queries/0/files/0", "/queries/0/files/1", "/queries/1/files/0"],
        );
        expect(log.warn.mock.calls).toEqual(
          Object.entries(failures).map(([field, count]) => [
            { field, count },
            "kics: scan reported failures",
          ]),
        );
        for (const candidate of candidates) expect(provenance(candidate).document).toEqual(context);
      }
    }
  });

  it("recovers malformed diagnostic counts independently without logging source values", async () => {
    for (const field of [
      "files_failed_to_scan",
      "queries_failed_to_execute",
      "queries_failed_to_compute_similarity_id",
      "total_bom_resources",
    ]) {
      for (const value of [
        null,
        -1,
        1.5,
        Number.MAX_SAFE_INTEGER + 1,
        "SECRET-count",
        true,
        [],
        { "SECRET-key": "SECRET-value" },
      ]) {
        for (const queries of [[], [query()]]) {
          const context = { [field]: value };
          const { candidates, log } = await normalize(report(queries, context));
          expect(candidates).toHaveLength(queries.length);
          expect(log.warn.mock.calls).toEqual([
            [{ field }, "kics: ignoring unusable optional value"],
          ]);
          for (const candidate of candidates)
            expect(provenance(candidate).document).toEqual(context);
        }
      }
    }
    const { candidates, log } = await normalize(
      report([], {
        files_failed_to_scan: "SECRET-count",
        queries_failed_to_execute: 2,
        queries_failed_to_compute_similarity_id: 3,
      }),
    );
    expect(candidates).toEqual([]);
    expect(log.warn.mock.calls).toEqual([
      [{ field: "files_failed_to_scan" }, "kics: ignoring unusable optional value"],
      [{ field: "queries_failed_to_execute", count: 2 }, "kics: scan reported failures"],
      [
        { field: "queries_failed_to_compute_similarity_id", count: 3 },
        "kics: scan reported failures",
      ],
    ]);
  });

  it("accepts healthy empty scans and absent or zero diagnostics silently", async () => {
    for (const context of [
      {},
      {
        files_failed_to_scan: 0,
        queries_failed_to_execute: 0,
        queries_failed_to_compute_similarity_id: 0,
        total_bom_resources: 0,
        bill_of_materials: [],
      },
    ]) {
      const { candidates, log } = await normalize(report([], context));
      expect(candidates).toEqual([]);
      expect(log.warn).not.toHaveBeenCalled();
    }
  });

  it("counts inventory occurrences once, preferring the collection over summary totals", async () => {
    const inventory = [
      { files: [{ secret: "SECRET-inventory" }, {}, null] },
      { files: [] },
      { files: [{}, {}] },
    ];
    for (const [context, count, invalidFields] of [
      [{ bill_of_materials: inventory }, 5, []],
      [{ bill_of_materials: inventory, total_bom_resources: 99 }, 5, []],
      [{ bill_of_materials: inventory, total_bom_resources: 0 }, 5, []],
      [
        { bill_of_materials: inventory, total_bom_resources: "SECRET-summary" },
        5,
        ["total_bom_resources"],
      ],
      [{ bill_of_materials: [], total_bom_resources: 99 }, 0, []],
      [{ bill_of_materials: [{ files: [] }], total_bom_resources: 99 }, 0, []],
      [{ total_bom_resources: 7 }, 7, []],
      ...[
        null,
        {},
        "SECRET-inventory",
        [null],
        [{}],
        [{ files: "SECRET-files" }],
        [inventory[0], {}],
      ].flatMap((bill_of_materials) => [
        [{ bill_of_materials, total_bom_resources: 7 }, 7, ["bill_of_materials"]],
        [{ bill_of_materials }, 0, ["bill_of_materials"]],
      ]),
    ] as Array<[Record<string, unknown>, number, string[]]>) {
      for (const queries of [[], [query({ files: [occurrence(), occurrence()] }), query()]]) {
        const { candidates, log } = await normalize(report(queries, context));
        expect(candidates.map((candidate) => candidate.sourceRecord)).toEqual(
          queries.length === 0
            ? []
            : ["/queries/0/files/0", "/queries/0/files/1", "/queries/1/files/0"],
        );
        expect(log.warn.mock.calls).toEqual([
          ...invalidFields.map((field) => [{ field }, "kics: ignoring unusable optional value"]),
          ...(count > 0
            ? [[{ field: "bill_of_materials", count }, "kics: skipping inventory occurrences"]]
            : []),
        ]);
        const document = Object.fromEntries(
          Object.entries(context).filter(([key]) => key !== "bill_of_materials"),
        );
        for (const candidate of candidates)
          expect(provenance(candidate).document).toEqual(document);
        expect(JSON.stringify(log.warn.mock.calls)).not.toContain("SECRET");
      }
    }
  });

  // Synthetic current-format records, not captured scans for these platforms.
  it.each([
    ["Kubernetes", "./manifests/../pod.yaml", "Pod", " app "],
    ["CloudFormation", "/checkout/template.yml", "AWS::S3::Bucket", "Bucket"],
    ["Dockerfile", "C:\\workspace\\Dockerfile", undefined, undefined],
    ["Common", "https://example.test/raw/config", undefined, undefined],
    ["custom-platform", " ../custom.config ", "custom-type", " custom symbol \n"],
  ])(
    "accepts synthetic %s without platform-based identity inference",
    async (platform, file_name, resource_type, resource_name) => {
      const result = occurrence({
        file_name,
        resource_type,
        resource_name,
        line: 7,
        search_line: 99,
      });
      const raw = report(
        [
          query({
            platform,
            cloud_provider: "custom-provider",
            category: "custom-category",
            files: [result],
            query_name: " Human title \n",
            description: " full\r\n description \n",
            query_url: "https://example.test/query",
            cwe: "079",
          }),
        ],
        { paths: ["/not-the-repository"], kics_version: "future" },
      );
      const { candidates, log } = await normalize(raw);
      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toMatchObject({
        title: " Human title \n",
        description: " full\r\n description \n",
        weakness: {
          identifiers: { kics: ["custom/rule:1"], cwe: ["CWE-79"] },
          references: ["https://example.test/query"],
        },
        assetIdentifierCandidates: [],
      });
      expect(candidates[0].affectedResource).toEqual({
        type: "sourceCode",
        file: file_name,
        location: { startLine: 7 },
        ...(resource_name === undefined ? {} : { symbol: resource_name }),
      });
      expect(log.warn).not.toHaveBeenCalled();
    },
  );

  it.each(["", " \n\t", '{"SECRET-key":', "SECRET-parser-text"])(
    "rejects invalid JSON safely (%#)",
    async (text) => {
      await expect(run(new TextEncoder().encode(text))).rejects.toEqual(
        new Error("kics: invalid JSON or UTF-8"),
      );
    },
  );

  it("rejects invalid UTF-8 even in an otherwise valid document", async () => {
    const input = Buffer.concat([
      Buffer.from('{"queries":[],"unknown":"'),
      Buffer.from([0xff]),
      Buffer.from('"}'),
    ]);
    await expect(run(input)).rejects.toEqual(new Error("kics: invalid JSON or UTF-8"));
  });

  it("rejects unusable roots and envelopes with ordinary structural errors", async () => {
    for (const raw of [
      null,
      [],
      "SECRET-root",
      42,
      true,
      {},
      { unrelated: [] },
      ...[undefined, null, {}, 42, true, "SECRET-queries"].map((queries) => ({ queries })),
    ]) {
      const error = await normalize(raw).catch((reason: unknown) => reason);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).constructor).toBe(Error);
      expect(String(error)).toMatch(
        /^Error: kics: (document must be a JSON object|\/queries must be an array)$/u,
      );
    }
  });

  it("rejects late malformed queries and occurrences atomically without source content", async () => {
    const invalidValues = [undefined, null, [], {}, "", " \n\t", 42, true];
    const invalidQueries = [
      null,
      [],
      42,
      true,
      "SECRET-query",
      ...invalidValues.map((query_id) => query({ query_id })),
      ...[undefined, null, {}, 42, true, "SECRET-files"].map((files) => query({ files })),
    ];
    const invalidResults = [
      null,
      [],
      42,
      true,
      "SECRET-result",
      ...invalidValues.map((file_name) => occurrence({ file_name })),
    ];
    for (const [raw, locator] of [
      ...invalidQueries.map((invalid) => [report([query(), invalid]), "/queries/1"] as const),
      ...invalidResults.map(
        (invalid) =>
          [report([query({ files: [occurrence(), invalid] })]), "/queries/0/files/1"] as const,
      ),
    ]) {
      const log = logger();
      const error = await run(bytes(raw), log).catch((reason: unknown) => reason);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).constructor).toBe(Error);
      expect(String(error)).toContain(locator);
      expect(String(error)).toMatch(
        /^Error: kics: \/queries\/\d+(?:\/files\/\d+)?(?:\/(?:query_id|files|file_name))? must be (?:an object|an array|a nonblank string)$/u,
      );
      expect(
        JSON.stringify([error, ...log.warn.mock.calls, ...log.debug.mock.calls]),
      ).not.toContain("SECRET");
    }
  });

  it.each([undefined, null, "", " \n\t"])(
    "treats unavailable optional text as absent (%#)",
    async (value) => {
      const { candidates, log } = await normalize(
        report([
          query({
            query_name: value,
            description: value,
            query_url: value,
            cwe: value,
            files: [
              occurrence({
                resource_name: value,
                expected_value: value,
                actual_value: value,
                remediation: value,
                remediation_type: value,
              }),
            ],
          }),
        ]),
      );
      expect(candidates[0]).toMatchObject({
        title: "custom/rule:1",
        description: null,
        evidence: null,
        remediation: null,
      });
      expect(candidates[0].weakness).toEqual({ identifiers: { kics: ["custom/rule:1"] } });
      expect(candidates[0].affectedResource).toEqual({ type: "sourceCode", file: "main.tf" });
      expect(log.warn).not.toHaveBeenCalled();
    },
  );

  it.each([
    "query_name",
    "description",
    "query_url",
    "resource_name",
    "expected_value",
    "actual_value",
    "remediation",
    "remediation_type",
  ])("recovers malformed %s independently", async (field) => {
    for (const value of [42, true, ["SECRET-value"], { "SECRET-key": "SECRET-value" }]) {
      const result = occurrence({
        resource_name: "symbol",
        expected_value: "expected",
        actual_value: "actual",
        remediation: "fix",
        remediation_type: "addition",
      });
      const sourceQuery = query({
        query_name: "title",
        description: "description",
        query_url: "url",
        cwe: "79",
      });
      if (["query_name", "description", "query_url"].includes(field))
        Object.assign(sourceQuery, { [field]: value });
      else Object.assign(result, { [field]: value });
      const { candidates, log } = await normalize(report([{ ...sourceQuery, files: [result] }]));
      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toMatchObject({
        title: field === "query_name" ? "custom/rule:1" : "title",
        description: field === "description" ? null : "description",
        severity: "high",
        evidence: [
          ...(field === "expected_value" ? [] : [renderEvidenceSection("Expected", "expected")]),
          ...(field === "actual_value" ? [] : [renderEvidenceSection("Actual", "actual")]),
        ].join("\n\n"),
        remediation:
          field === "remediation"
            ? null
            : renderEvidenceSection(
                field === "remediation_type"
                  ? "Suggested remediation"
                  : "Suggested remediation (addition)",
                "fix",
              ),
      });
      expect(candidates[0].weakness).toEqual({
        identifiers: { kics: ["custom/rule:1"], cwe: ["CWE-79"] },
        ...(field === "query_url" ? {} : { references: ["url"] }),
      });
      expect(candidates[0].affectedResource).toEqual({
        type: "sourceCode",
        file: "main.tf",
        ...(field === "resource_name" ? {} : { symbol: "symbol" }),
      });
      expect(provenance(candidates[0]).result).toEqual(result);
      expect(log.warn).toHaveBeenCalledExactlyOnceWith(
        {
          sourceRecord: ["query_name", "description", "query_url"].includes(field)
            ? "/queries/0"
            : "/queries/0/files/0",
          field,
        },
        "kics: ignoring unusable optional value",
      );
      expect(JSON.stringify(log.warn.mock.calls)).not.toContain("SECRET");
    }
  });

  it("canonicalizes a single CWE and drops invalid classifications without candidate loss", async () => {
    for (const [cwe, expected] of [
      ["0079", "CWE-79"],
      [" cwe-079 ", "CWE-79"],
      ["CWE-89", "CWE-89"],
      ...[
        "CWE-0",
        "0",
        "SECRET-cwe",
        "CWE-79: label",
        79,
        true,
        ["CWE-79"],
        { "SECRET-key": 79 },
      ].map((value) => [value, undefined]),
    ] as const) {
      const { candidates, log } = await normalize(report([query({ cwe })]));
      expect(candidates).toHaveLength(1);
      expect(candidates[0].weakness.identifiers).toEqual({
        kics: ["custom/rule:1"],
        ...(expected === undefined ? {} : { cwe: [expected] }),
      });
      expect(log.warn).toHaveBeenCalledTimes(expected === undefined ? 1 : 0);
      expect(provenance(candidates[0]).query.cwe).toEqual(cwe);
    }
  });

  it("maps only explicit severity, never scores or descriptive context", async () => {
    for (const [severity, expected] of [
      ["CRITICAL", "critical"],
      ["HIGH", "high"],
      ["MEDIUM", "medium"],
      ["LOW", "low"],
      ["INFO", "info"],
      ["TRACE", "info"],
      ...[undefined, null, "", "critical", "constructor", "SECRET-severity", 42, true, [], {}].map(
        (value) => [value, "info"],
      ),
    ] as const) {
      for (const risk_score of [0, 10, "8.8", { "SECRET-score": true }]) {
        const { candidates, log } = await normalize(
          report([query({ severity, risk_score, query_name: "CRITICAL", category: "HIGH" })]),
        );
        expect(candidates[0].severity).toBe(expected);
        expect(candidates[0].weakness).toEqual({ identifiers: { kics: ["custom/rule:1"] } });
        expect(provenance(candidates[0]).query.risk_score).toEqual(risk_score);
        // Absent severity defaults silently; only a present, unknown value is warned.
        expect(log.warn).toHaveBeenCalledTimes(
          severity === undefined ||
            severity === null ||
            (typeof severity === "string" &&
              ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO", "TRACE"].includes(severity))
            ? 0
            : 1,
        );
      }
    }
  });

  it.each([
    ["2026-09-16T18:59:18.905190313Z", "2026-09-16T18:59:18.905Z"],
    ["2024-02-29T23:30:12.123456789+05:30", "2024-02-29T18:00:12.123Z"],
    ["2000-02-29T00:00:00-04:00", "2000-02-29T04:00:00.000Z"],
    ["2026-01-01t00:00:00z", "2026-01-01T00:00:00.000Z"],
    ["2016-12-31T23:59:60Z", "2016-12-31T23:59:59.000Z"],
    ["2016-12-31T23:59:60.5Z", "2016-12-31T23:59:59.500Z"],
    ["2017-01-01T05:29:60+05:30", "2016-12-31T23:59:59.000Z"],
  ])("uses the scan-end instant %s with millisecond precision", async (end, expected) => {
    const { candidates, log } = await normalize(
      report([query({ files: [occurrence(), occurrence()] }), query()], { end }),
    );
    expect(candidates).toHaveLength(3);
    for (const candidate of candidates) {
      expect(candidate.observedAt?.toISOString()).toBe(expected);
      expect(provenance(candidate).document.end).toBe(end);
    }
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("recovers absent or unusable end, rejects impossible dates, and never substitutes start or now", async () => {
    for (const end of [
      undefined,
      null,
      "",
      " ",
      0,
      true,
      {},
      [],
      "SECRET-end",
      "2026-01-01",
      "2026-01-01T00:00:00",
      "2026-01-01T00:00Z",
      "2026-02-30T00:00:00Z",
      "2025-02-29T00:00:00+01:00",
      "1900-02-29T00:00:00Z",
      "2026-04-31T00:00:00Z",
      "2026-00-01T00:00:00Z",
      "2026-13-01T00:00:00Z",
      "2026-01-00T00:00:00Z",
      "2026-01-01T24:00:00Z",
      "2026-01-01T00:60:00Z",
      "2026-01-01T00:00:61Z",
      "2026-01-01T00:00:00+24:00",
      "2026-01-01T00:00:00+00:60",
      "2026-01-01T00:00:00Z\n",
      "2016-12-30T23:59:60Z",
      "0001-01-01T00:00:00Z",
      "0001-01-01T01:00:00+01:00",
    ]) {
      const { candidates, log } = await normalize(
        report([query({ files: [occurrence(), occurrence()] })], {
          end,
          start: "2026-01-01T00:00:00Z",
        }),
      );
      expect(candidates.map((item) => item.observedAt)).toEqual([null, null]);
      expect(log.warn.mock.calls).toEqual(
        end === undefined ? [] : [[{ field: "end" }, "kics: ignoring unusable optional value"]],
      );
    }
  });

  it("keeps only positive integer primary lines, never search coordinates", async () => {
    for (const line of [undefined, null, 0, -1, 1.5, "9", true, {}, [], 1, 42]) {
      const { candidates, log } = await normalize(
        report([
          query({
            files: [
              occurrence({ line, search_line: 99, search_key: "other", resource_type: "type" }),
            ],
          }),
        ]),
      );
      const valid = line === 1 || line === 42;
      expect(candidates[0].affectedResource).toEqual({
        type: "sourceCode",
        file: "main.tf",
        ...(valid ? { location: { startLine: line } } : {}),
      });
      expect(log.warn).toHaveBeenCalledTimes(valid || line === undefined ? 0 : 1);
    }
  });

  it("recovers each evidence side and remediation type independently", async () => {
    for (const unavailable of [undefined, null, "", " \n", 42, true, {}, []]) {
      for (const [expected_value, actual_value, expected] of [
        [unavailable, "actual", renderEvidenceSection("Actual", "actual")],
        ["expected", unavailable, renderEvidenceSection("Expected", "expected")],
        [unavailable, unavailable, null],
      ]) {
        const { candidates } = await normalize(
          report([
            query({
              files: [
                occurrence({
                  expected_value,
                  actual_value,
                  remediation: "fix",
                  remediation_type: unavailable,
                }),
              ],
            }),
          ]),
        );
        expect(candidates[0].evidence).toBe(expected);
        expect(candidates[0].remediation).toBe(
          renderEvidenceSection("Suggested remediation", "fix"),
        );
      }
    }
  });

  it("retains complete source text behind safe fences, including JSON replacements and hostile labels", async () => {
    const text = "  expected\r\n```\n" + "long source line\n".repeat(2_000) + "````\n\n";
    const replacement = '{"before":"```","after":"````"}';
    const { candidates } = await normalize(
      report([
        query({
          files: [
            occurrence({
              expected_value: text,
              actual_value: "```actual```\n",
              remediation: replacement,
              remediation_type: "</summary><script>&```",
            }),
          ],
        }),
      ]),
    );
    expect(candidates[0].evidence).toBe(
      `<details><summary>Expected</summary>\n\n\`\`\`\`\`\n${text}\n\`\`\`\`\`\n\n</details>\n\n<details><summary>Actual</summary>\n\n\`\`\`\`\n\`\`\`actual\`\`\`\n\n\`\`\`\`\n\n</details>`,
    );
    expect(candidates[0].remediation).toBe(
      `<details><summary>Suggested remediation (&lt;/summary&gt;&lt;script&gt;&amp;\`\`\`)</summary>\n\n\`\`\`\`\`\n${replacement}\n\`\`\`\`\`\n\n</details>`,
    );
  });

  it("owns raw provenance without sibling collections and never logs source content", async () => {
    const malformed = { "SECRET-arbitrary-key": ["SECRET-value"] };
    const result = occurrence({
      file_name: "SECRET-path",
      resource_name: "SECRET-symbol",
      line: malformed,
      expected_value: ["SECRET-evidence"],
      actual_value: "SECRET-actual",
      remediation: malformed,
      remediation_type: malformed,
      search_key: "SECRET-search",
      search_line: -1,
      search_value: malformed,
      value: malformed,
      resource_type: "SECRET-type",
      similarity_id: "SECRET-similarity",
      old_similarity_id: "SECRET-old",
      unknown: malformed,
    });
    const context = {
      query_id: "SECRET-rule",
      query_name: malformed,
      description: ["SECRET-description"],
      query_url: malformed,
      cwe: "SECRET-cwe",
      severity: "SECRET-severity",
      risk_score: malformed,
      cis: malformed,
      description_id: "SECRET-description-id",
      unknown: malformed,
    };
    const document = {
      paths: ["SECRET-path"],
      end: "SECRET-timestamp",
      unknown: malformed,
      ["__proto__"]: { "SECRET-proto-key": true },
    };
    const input = bytes(
      report(
        [
          { ...context, files: [result, result] },
          { ...context, files: [result] },
        ],
        { ...document, bill_of_materials: ["SECRET-inventory"] },
      ),
    );
    const original = input.slice();
    const { candidates, log } = await run(input);
    expect(candidates).toHaveLength(3);
    for (const candidate of candidates) {
      expect(candidate.sourceMetadata).toEqual({
        provenance: { result, query: context, document },
      });
      expect(candidate.affectedResource).toEqual({
        type: "sourceCode",
        file: "SECRET-path",
        symbol: "SECRET-symbol",
      });
      expect(candidate.assetIdentifierCandidates).toEqual([]);
    }
    const first = provenance(candidates[0]);
    for (const scope of ["document", "query", "result"] as const) {
      (first[scope].unknown as typeof malformed)["SECRET-arbitrary-key"].push("changed");
    }
    expect(provenance(candidates[1])).toEqual({ result, query: context, document });
    expect(provenance(candidates[2])).toEqual({ result, query: context, document });
    expect(Object.hasOwn(first.document, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(first.document)).toBe(Object.prototype);
    expect(input).toEqual(original);
    expect(log.warn).toHaveBeenCalled();
    expect(
      JSON.stringify([...log.warn.mock.calls, ...log.info.mock.calls, ...log.debug.mock.calls]),
    ).not.toContain("SECRET");
    for (const [fields, message] of log.warn.mock.calls) {
      expect(message).toBe("kics: ignoring unusable optional value");
      expect(Object.keys(fields).every((key) => ["sourceRecord", "field"].includes(key))).toBe(
        true,
      );
      expect([
        "end",
        "bill_of_materials",
        "query_name",
        "description",
        "query_url",
        "cwe",
        "severity",
        "line",
        "expected_value",
        "remediation",
        "remediation_type",
      ]).toContain(fields.field);
      if (fields.sourceRecord !== undefined)
        expect(fields.sourceRecord).toMatch(/^\/queries\/[01](?:\/files\/[01])?$/u);
    }
  });
});

it("lets classifier registration stamp the source and canonicalize opaque rule identifiers", async () => {
  const log = logger();
  const classifier = new Classifier(log as unknown as Logger);
  classifier.registerNormalizer("kics", {
    async normalize(input, logger) {
      return (await normalizer.normalize(input, logger)).map((candidate) => ({
        ...candidate,
        source: "unstamped",
      }));
    },
  });
  const input = bytes(
    report([
      query({
        query_id: " custom/RULE:1 ",
        cwe: " cwe-079 ",
        query_url: " https://example.test/rule ",
      }),
    ]),
  );
  const direct = await normalizer.normalize(input, log as unknown as Logger);
  expect(direct[0].weakness.identifiers.kics).toEqual([" custom/RULE:1 "]);
  const candidates = await classifier.normalize("kics", input);
  expect(candidates).toEqual([
    { ...direct[0], source: "kics", weakness: weaknessSchema.parse(direct[0].weakness) },
  ]);
  expect(candidates[0].weakness.identifiers).toEqual({ kics: ["custom/RULE:1"], cwe: ["CWE-79"] });
  expect(log.warn).not.toHaveBeenCalled();
});
