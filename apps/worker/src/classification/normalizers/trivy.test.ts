import { readFileSync } from "node:fs";

import { assetIdentifierSchema } from "@exposurenexus/backend/assets";
import { weaknessSchema } from "@exposurenexus/backend/findings";
import { observationAffectedResourceSchema } from "@exposurenexus/contracts/model/affected-resource";
import { describe, expect, it, vi } from "vitest";

import { Classifier } from "../classifier.js";
import { renderCodeBlock } from "./shared.js";
import { TrivyNormalizer } from "./trivy.js";

import type { Normalizer, ObservationCandidate } from "../classifier.js";
import type { Logger } from "pino";

const normalizer: Normalizer = new TrivyNormalizer();
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const detection = (overrides: Record<string, unknown> = {}) => ({
  ID: "custom/rule:1",
  Status: "FAIL",
  Severity: "HIGH",
  ...overrides,
});
const result = (overrides: Record<string, unknown> = {}) => ({
  Target: "main.tf",
  Class: "config",
  Type: "terraform",
  Misconfigurations: [detection()],
  ...overrides,
});
const report = (Results: unknown = [result()], context: Record<string, unknown> = {}) => ({
  SchemaVersion: 2,
  ArtifactName: "/local/checkout",
  ArtifactType: "filesystem",
  Results,
  ...context,
});
const collections = [
  "Vulnerabilities",
  "Misconfigurations",
  "Secrets",
  "Licenses",
  "CustomResources",
  "ExperimentalModifiedFindings",
  "Packages",
  "CryptoAssets",
];
function logger() {
  return { warn: vi.fn(), info: vi.fn(), debug: vi.fn() };
}
function provenance(candidate: ObservationCandidate) {
  return candidate.sourceMetadata.provenance as {
    document: Record<string, unknown>;
    scanResult: Record<string, unknown>;
    result: Record<string, unknown>;
  };
}

describe.each(["direct", "classifier"] as const)("TrivyNormalizer %s", (mode) => {
  async function run(input: Uint8Array, log = logger()) {
    const typedLog = log as unknown as Logger;
    const classifier = new Classifier(typedLog);
    classifier.registerNormalizer("trivy", normalizer);
    const candidates = await (mode === "direct"
      ? normalizer.normalize(input, typedLog)
      : classifier.normalize("trivy", input));
    for (const candidate of candidates) {
      expect(candidate.source).toBe("trivy");
      expect(observationAffectedResourceSchema.safeParse(candidate.affectedResource).success).toBe(
        true,
      );
      expect(weaknessSchema.safeParse(candidate.weakness).success).toBe(true);
      expect(
        assetIdentifierSchema.array().safeParse(candidate.assetIdentifierCandidates).success,
      ).toBe(true);
    }
    return { candidates, log };
  }
  const normalize = (raw: unknown) => run(bytes(raw));

  it("retains all TerraGoat detections, source fields, occurrences, and compact provenance", async () => {
    const input = readFileSync(new URL("./fixtures/trivy.json", import.meta.url));
    const original = Buffer.from(input);
    type Occurrence = {
      Resource: string;
      Filename: string;
      Location: { StartLine: number; EndLine: number };
    };
    type Detection = Record<string, unknown> & {
      ID: string;
      AVDID?: string;
      Status: string;
      Title: string;
      Description: string;
      Severity: string;
      PrimaryURL: string;
      References: string[];
      Message: string;
      Resolution: string;
      CauseMetadata: {
        Resource: string;
        StartLine: number;
        EndLine: number;
        Code: { Lines: Array<{ Content: string }> };
        Occurrences?: Occurrence[];
      };
    };
    const raw = JSON.parse(input.toString("utf8")) as {
      SchemaVersion: number;
      Trivy: { Version: string };
      ArtifactType: string;
      CreatedAt: string;
      Results: Array<Record<string, unknown> & { Target: string; Misconfigurations?: Detection[] }>;
    };
    const { Results, ...document } = raw;
    expect(raw).toMatchObject({
      SchemaVersion: 2,
      Trivy: { Version: "0.74.0" },
      ArtifactType: "filesystem",
    });
    expect(raw.CreatedAt).toBe("2026-09-16T18:57:33.949652717Z");
    expect(Results).toHaveLength(33);
    expect(Results.filter((group) => group.Misconfigurations === undefined)).toHaveLength(5);
    const { candidates, log } = await run(input);
    expect(candidates).toHaveLength(252);
    const totals: Record<string, number> = {};
    const ids = new Set<string>();
    let index = 0;
    let occurrenceCount = 0;
    let withOccurrences = 0;
    for (const [r, group] of Results.entries()) {
      expect(group.Type).toBe("terraform");
      const scanResult = Object.fromEntries(
        Object.entries(group).filter(([key]) => !collections.includes(key)),
      );
      for (const [m, item] of (group.Misconfigurations ?? []).entries()) {
        const candidate = candidates[index++];
        const cause = item.CauseMetadata;
        expect(item.Status).toBe("FAIL");
        ids.add(item.ID);
        totals[candidate.severity] = (totals[candidate.severity] ?? 0) + 1;
        expect(candidate).toMatchObject({
          sourceRecord: `/Results/${r}/Misconfigurations/${m}`,
          title: item.Title,
          description: item.Description,
          severity: item.Severity.toLowerCase(),
          remediation: item.Resolution,
          observedAt: new Date("2026-09-16T18:57:33.949Z"),
          assetIdentifierCandidates: [],
        });
        expect(weaknessSchema.parse(candidate.weakness)).toEqual(
          weaknessSchema.parse({
            identifiers: { trivy: [item.ID, ...(item.AVDID ? [item.AVDID] : [])] },
            references: [item.PrimaryURL, ...item.References],
          }),
        );
        expect(candidate.affectedResource).toEqual({
          type: "sourceCode",
          file: group.Target,
          location: { startLine: cause.StartLine, endLine: cause.EndLine },
          symbol: cause.Resource,
        });
        expect(item.Description.trim()).not.toBe("");
        expect(item.Resolution.trim()).not.toBe("");
        expect(candidate.evidence).toContain(renderCodeBlock(item.Message));
        expect(candidate.evidence).toContain(
          renderCodeBlock(cause.Code.Lines.map((line) => line.Content).join("\n")),
        );
        if (cause.Occurrences?.length) withOccurrences++;
        for (const occurrence of cause.Occurrences ?? []) {
          occurrenceCount++;
          expect(candidate.evidence).toContain(occurrence.Resource);
          expect(candidate.evidence).toContain(occurrence.Filename);
          expect(candidate.evidence).toContain(
            `Lines: ${occurrence.Location.StartLine}${occurrence.Location.EndLine === occurrence.Location.StartLine ? "" : `-${occurrence.Location.EndLine}`}`,
          );
        }
        expect(candidate.sourceMetadata).toEqual({
          provenance: { document, scanResult, result: item },
        });
      }
    }
    expect(totals).toEqual({ critical: 15, high: 77, medium: 103, low: 57 });
    expect(ids.size).toBe(144);
    expect(withOccurrences).toBe(81);
    expect(occurrenceCount).toBe(111);
    expect(log.warn).not.toHaveBeenCalled();
    expect(input.equals(original)).toBe(true);
  });

  it("maps minimal failures without invented context", async () => {
    const { candidates, log } = await normalize(report());
    expect(candidates).toEqual([
      {
        source: "trivy",
        sourceRecord: "/Results/0/Misconfigurations/0",
        title: "custom/rule:1",
        description: null,
        severity: "high",
        weakness: { identifiers: { trivy: ["custom/rule:1"] } },
        affectedResource: { type: "sourceCode", file: "main.tf" },
        assetIdentifierCandidates: [],
        observedAt: null,
        evidence: null,
        remediation: null,
        sourceMetadata: {
          provenance: {
            document: {
              SchemaVersion: 2,
              ArtifactName: "/local/checkout",
              ArtifactType: "filesystem",
            },
            scanResult: { Target: "main.tf", Class: "config", Type: "terraform" },
            result: detection(),
          },
        },
      },
    ]);
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("accepts clean reports, non-failing records without candidate-only fields, and future producers", async () => {
    for (const Results of [
      undefined,
      [],
      [{ Target: "clean" }],
      [result({ Misconfigurations: [] })],
      [
        result({
          Target: undefined,
          Misconfigurations: [{ Status: "PASS" }, { Status: "EXCEPTION", ID: null }],
        }),
      ],
    ]) {
      for (const Version of ["0.74.0", "0.75.0", "future-version"]) {
        const { candidates, log } = await normalize(
          report(Results, { Results, Trivy: { Version } }),
        );
        expect(candidates).toEqual([]);
        expect(log.warn).not.toHaveBeenCalled();
      }
    }
  });

  it("preserves order, duplicates, and original indexes independently of summaries and excluded collections", async () => {
    const item = detection({ ID: "repeated", CauseMetadata: { Resource: "aws_s3_bucket.same" } });
    const excluded = {
      Secrets: [{ SECRET: "secret payload" }],
      Licenses: [{ SECRET: "license payload" }],
      CustomResources: [{ SECRET: "custom payload" }],
      ExperimentalModifiedFindings: [item],
      Packages: [{ SECRET: "inventory" }],
      CryptoAssets: [{ SECRET: "crypto inventory" }],
      MisconfSummary: { Successes: 999, Failures: 0 },
    };
    const { candidates } = await normalize(
      report([
        result({ Misconfigurations: [] }),
        result({
          ...excluded,
          Misconfigurations: [{ Status: "PASS" }, item, { Status: "EXCEPTION" }, item],
        }),
        result({ Target: "other.tf", Misconfigurations: [detection({ ID: "last" })] }),
      ]),
    );
    expect(candidates.map((item) => item.sourceRecord)).toEqual([
      "/Results/1/Misconfigurations/1",
      "/Results/1/Misconfigurations/3",
      "/Results/2/Misconfigurations/0",
    ]);
    expect(candidates[0]).toEqual({ ...candidates[1], sourceRecord: candidates[0].sourceRecord });
    expect(candidates[2].title).toBe("last");
    expect(provenance(candidates[0]).scanResult).toEqual({
      Target: "main.tf",
      Class: "config",
      Type: "terraform",
      MisconfSummary: excluded.MisconfSummary,
    });
    expect(
      (await normalize(report([result({ ...excluded, Misconfigurations: undefined })]))).candidates,
    ).toEqual([]);
  });

  it("counts excluded records once per result while retaining mixed candidates and compact context", async () => {
    const item = detection({ ID: "SECRET-rule", Message: "SECRET-code", Resolution: "fix" });
    const vulnerability = {
      VulnerabilityID: "SECRET-advisory",
      PkgName: "SECRET-package",
      Severity: "LOW",
      Status: "fixed",
      InstalledVersion: "1",
      FixedVersion: "2, 3",
    };
    const unknown = { "SECRET-key": ["SECRET-value"] };
    const context = {
      Target: "SECRET-path",
      Class: "SECRET-class",
      Type: "SECRET-type",
      MisconfSummary: { Successes: 999, Failures: 0, Exceptions: 999 },
      unknown,
    };
    const excluded = {
      Secrets: [unknown, unknown],
      Licenses: [unknown],
      CustomResources: [unknown, unknown, unknown],
      ExperimentalModifiedFindings: [
        { Type: "SECRET-type", Vulnerability: vulnerability },
        { Type: "SECRET-type", Misconfiguration: item },
      ],
      Packages: [unknown],
      CryptoAssets: [unknown],
    };
    const raw = report([
      { Target: "SECRET-clean" },
      {
        ...context,
        ...excluded,
        Misconfigurations: [{ Status: "PASS" }, item, { Status: "EXCEPTION" }, item],
        Vulnerabilities: [vulnerability, vulnerability],
      },
      { ...context, Secrets: [unknown], Misconfigurations: [item] },
    ]);
    const input = bytes(raw);
    const original = input.slice();
    const { candidates, log } = await run(input);
    expect(candidates.map((candidate) => candidate.sourceRecord)).toEqual([
      "/Results/1/Vulnerabilities/0",
      "/Results/1/Vulnerabilities/1",
      "/Results/1/Misconfigurations/1",
      "/Results/1/Misconfigurations/3",
      "/Results/2/Misconfigurations/0",
    ]);
    expect(candidates[0]).toEqual({ ...candidates[1], sourceRecord: candidates[0].sourceRecord });
    expect(candidates[2]).toEqual({ ...candidates[3], sourceRecord: candidates[2].sourceRecord });
    expect(candidates[0]).toMatchObject({
      severity: "low",
      affectedResource: { type: "package", name: "SECRET-package", version: "1" },
    });
    expect(candidates[0].remediation).toContain("2, 3");
    expect(candidates[2]).toMatchObject({
      severity: "high",
      affectedResource: { type: "sourceCode", file: "SECRET-path" },
      remediation: "fix",
    });
    const { Results: _results, ...document } = raw;
    for (const [index, candidate] of candidates.entries()) {
      expect(candidate.assetIdentifierCandidates).toEqual([]);
      expect(provenance(candidate)).toEqual({
        document,
        scanResult: context,
        result: index < 2 ? vulnerability : item,
      });
    }
    expect(log.warn.mock.calls).toEqual(
      [
        { sourceRecord: "/Results/1", field: "Secrets", count: 2 },
        { sourceRecord: "/Results/1", field: "Licenses", count: 1 },
        { sourceRecord: "/Results/1", field: "CustomResources", count: 3 },
        { sourceRecord: "/Results/1", field: "ExperimentalModifiedFindings", count: 2 },
        { sourceRecord: "/Results/2", field: "Secrets", count: 1 },
      ].map((fields) => [fields, "trivy: skipping excluded detection records"]),
    );
    expect(
      JSON.stringify([log.warn.mock.calls, log.info.mock.calls, log.debug.mock.calls]),
    ).not.toContain("SECRET");
    (provenance(candidates[0]).scanResult.unknown as typeof unknown)["SECRET-key"].push("changed");
    expect(provenance(candidates[1]).scanResult).toEqual(context);
    expect(input).toEqual(original);
  });

  it.each(["Secrets", "Licenses", "CustomResources", "ExperimentalModifiedFindings"])(
    "counts %s without interpreting its records and recovers malformed collections",
    async (field) => {
      const ignored = [
        null,
        false,
        42,
        "SECRET-payload",
        [],
        { "SECRET-key": "SECRET-value" },
        { Vulnerability: { VulnerabilityID: "SECRET-id" } },
        { Misconfiguration: { Status: "SECRET-status" } },
      ];
      for (const supported of [false, true]) {
        for (const value of [
          ignored,
          undefined,
          [],
          null,
          false,
          42,
          "SECRET-value",
          { "SECRET-key": [] },
        ]) {
          const group = {
            ...(supported ? result() : {}),
            [field]: value,
          };
          const { candidates, log } = await normalize(report([group]));
          expect(candidates).toHaveLength(supported ? 1 : 0);
          if (supported) {
            expect(provenance(candidates[0]).scanResult).toEqual({
              Target: "main.tf",
              Class: "config",
              Type: "terraform",
            });
          }
          expect(log.warn.mock.calls).toEqual(
            value === undefined || (Array.isArray(value) && value.length === 0)
              ? []
              : Array.isArray(value)
                ? [
                    [
                      { sourceRecord: "/Results/0", field, count: value.length },
                      "trivy: skipping excluded detection records",
                    ],
                  ]
                : [
                    [
                      { sourceRecord: "/Results/0", field },
                      "trivy: ignoring unusable optional value",
                    ],
                  ],
          );
          expect(log.info).not.toHaveBeenCalled();
        }
      }
    },
  );

  it("recovers excluded collections independently without masking essential late failures", async () => {
    const excluded = {
      Secrets: { "SECRET-key": "SECRET-value" },
      Licenses: ["SECRET-license"],
      CustomResources: null,
      ExperimentalModifiedFindings: ["SECRET-suppressed"],
    };
    const validPackage = { VulnerabilityID: "advisory", PkgName: "package", Severity: "HIGH" };
    const groups = [excluded, result({ Vulnerabilities: [validPackage] })];
    const { candidates, log } = await normalize(report(groups));
    expect(candidates).toHaveLength(2);
    expect(log.warn.mock.calls).toEqual([
      [{ sourceRecord: "/Results/0", field: "Secrets" }, "trivy: ignoring unusable optional value"],
      [
        { sourceRecord: "/Results/0", field: "Licenses", count: 1 },
        "trivy: skipping excluded detection records",
      ],
      [
        { sourceRecord: "/Results/0", field: "CustomResources" },
        "trivy: ignoring unusable optional value",
      ],
      [
        { sourceRecord: "/Results/0", field: "ExperimentalModifiedFindings", count: 1 },
        "trivy: skipping excluded detection records",
      ],
    ]);
    for (const bad of [
      { Vulnerabilities: "SECRET-array" },
      { Vulnerabilities: [{ ...validPackage, VulnerabilityID: null }] },
      { Vulnerabilities: [{ ...validPackage, PkgName: null }] },
      { Misconfigurations: "SECRET-array" },
      { Misconfigurations: [detection({ ID: null })] },
      { Misconfigurations: [detection({ Status: "SECRET-status" })] },
    ]) {
      const failureLog = logger();
      await expect(
        run(bytes(report([...groups, result({ ...excluded, ...bad })])), failureLog),
      ).rejects.toThrow(
        /^trivy: \/Results\/2\/(Vulnerabilities|Misconfigurations)(?:\/0\/(VulnerabilityID|PkgName|ID|Status))? must be /u,
      );
      expect(JSON.stringify(failureLog.warn.mock.calls)).not.toContain("SECRET");
    }
  });

  it("keeps inventory and summaries distinct from detections without claiming complete coverage", async () => {
    for (const inventory of [[{ "SECRET-key": "SECRET-value" }], null, "SECRET-inventory"]) {
      const group = {
        Target: "SECRET-target",
        Packages: inventory,
        CryptoAssets: inventory,
        MisconfSummary: { Failures: 999 },
        "SECRET-unknown-collection": [detection()],
        Vulnerabilities: [],
        Misconfigurations: [{ Status: "PASS" }, { Status: "EXCEPTION" }],
        Secrets: [],
        Licenses: [],
        CustomResources: [],
        ExperimentalModifiedFindings: [],
      };
      const { candidates, log } = await normalize(report([group]));
      expect(candidates).toEqual([]);
      expect(log.warn).not.toHaveBeenCalled();
      expect(log.info).not.toHaveBeenCalled();
    }
  });

  it.each([
    ["kubernetes", "./manifests/../pod.yaml"],
    ["cloudformation", "/checkout/template.yml"],
    ["dockerfile", "C:\\workspace\\Dockerfile"],
    ["future-format", " ../module//config "],
  ])(
    "accepts %s by detection shape and preserves path and symbol verbatim",
    async (Type, Target) => {
      const { candidates, log } = await normalize(
        report(
          [
            result({
              Target,
              Type,
              Class: "future-class",
              Misconfigurations: [
                detection({
                  Title: " Human title \n",
                  Description: " full\r\n description \n",
                  Resolution: " fix \n",
                  CauseMetadata: {
                    Resource: " module.parent.aws_s3_bucket.child \n",
                    StartLine: 7,
                    EndLine: 9,
                    Provider: "aws",
                    Service: "s3",
                  },
                }),
              ],
            }),
          ],
          { Trivy: { Version: "future" }, ArtifactName: "/not/a/repository" },
        ),
      );
      expect(candidates[0]).toMatchObject({
        title: " Human title \n",
        description: " full\r\n description \n",
        remediation: " fix \n",
        assetIdentifierCandidates: [],
      });
      expect(candidates[0].affectedResource).toEqual({
        type: "sourceCode",
        file: Target,
        symbol: " module.parent.aws_s3_bucket.child \n",
        location: { startLine: 7, endLine: 9 },
      });
      expect(log.warn).not.toHaveBeenCalled();
    },
  );

  it("rejects invalid encoding/JSON without leaking parser exception text", async () => {
    for (const input of [
      ...["", " \n\t", '{"SECRET-key":', "SECRET-parser-text"].map((text) =>
        new TextEncoder().encode(text),
      ),
      Buffer.concat([Buffer.from('{"SECRET-key":"'), Buffer.from([0xff]), Buffer.from('"}')]),
    ]) {
      await expect(run(input)).rejects.toEqual(new Error("trivy: invalid JSON or UTF-8"));
    }
  });

  it("rejects unrelated roots, unsupported envelopes/schema versions, and malformed report context", async () => {
    for (const raw of [
      null,
      [],
      "SECRET-root",
      42,
      true,
      {},
      { unrelated: [] },
      { SchemaVersion: 2, ClusterName: "SECRET-cluster", Resources: [] },
      { SchemaVersion: 2, Summary: { ID: "SECRET-compliance" }, Checks: [] },
      { Reports: [report()] },
      ...[undefined, null, 1, 3, "2", true].map((SchemaVersion) => report([], { SchemaVersion })),
      ...["ArtifactName", "ArtifactType"].flatMap((field) =>
        [undefined, null, 42, {}].map((value) => report([], { [field]: value })),
      ),
      ...[null, {}, 42, true, "SECRET-results"].map((Results) => report(Results)),
    ]) {
      const error = await normalize(raw).catch((reason: unknown) => reason);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).constructor).toBe(Error);
      expect(String(error)).toMatch(/^Error: trivy: /u);
      expect(String(error)).not.toContain("SECRET");
    }
  });

  it("rejects late malformed results, arrays, selection status, and essential fields atomically", async () => {
    const invalid = [undefined, null, [], {}, "", " \n\t", 42, true];
    const badRecords = [
      null,
      [],
      42,
      true,
      "SECRET-record",
      ...[...invalid, "SECRET-status", "fail"].map((Status) => detection({ Status })),
      ...invalid.map((ID) => detection({ ID })),
    ];
    const cases: Array<[unknown, string]> = [
      ...[null, [], 42, true, "SECRET-result"].map((bad): [unknown, string] => [
        report([result(), bad]),
        "/Results/1",
      ]),
      ...[null, {}, 42, true, "SECRET-array"].map((Misconfigurations): [unknown, string] => [
        report([result(), result({ Misconfigurations })]),
        "/Results/1",
      ]),
      ...invalid.map((Target): [unknown, string] => [
        report([result(), result({ Target })]),
        "/Results/1",
      ]),
      ...badRecords.map((bad): [unknown, string] => [
        report([result({ Misconfigurations: [detection(), bad] })]),
        "/Results/0/Misconfigurations/1",
      ]),
    ];
    for (const [raw, locator] of cases) {
      const log = logger();
      const error = await run(bytes(raw), log).catch((reason: unknown) => reason);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).constructor).toBe(Error);
      expect(String(error)).toMatch(/^Error: trivy: /u);
      expect(String(error)).toContain(locator);
      expect(
        JSON.stringify([String(error), log.warn.mock.calls, log.debug.mock.calls]),
      ).not.toContain("SECRET");
    }
  });

  it("treats missing/null/blank optional text as absent", async () => {
    for (const value of [undefined, null, "", " \n\t"]) {
      const { candidates, log } = await normalize(
        report([
          result({
            Misconfigurations: [
              detection({
                Title: value,
                Description: value,
                Message: value,
                Resolution: value,
                AVDID: value,
                PrimaryURL: value,
                CauseMetadata: { Resource: value },
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
      expect(candidates[0].weakness).toEqual({ identifiers: { trivy: ["custom/rule:1"] } });
      expect(candidates[0].affectedResource).toEqual({ type: "sourceCode", file: "main.tf" });
      expect(log.warn).not.toHaveBeenCalled();
    }
  });

  it.each([
    "Title",
    "Description",
    "Message",
    "Resolution",
    "AVDID",
    "PrimaryURL",
    "References",
    "CauseMetadata",
    "Resource",
    "Code",
    "Lines",
    "Content",
    "Occurrences",
  ])("recovers malformed %s without losing independent optional fields", async (field) => {
    const bad = ["CauseMetadata", "Code"].includes(field)
      ? "SECRET-non-object"
      : { "SECRET-key": ["SECRET-value"] };
    const cause: Record<string, unknown> = {
      Resource: "symbol",
      StartLine: 7,
      EndLine: 9,
      Code: { Lines: [{ Content: "code first" }, { Content: "code last" }] },
      Occurrences: [
        { Resource: "parent", Filename: "parent.tf", Location: { StartLine: 40, EndLine: 42 } },
      ],
    };
    const item = detection({
      Title: "title",
      Description: "description",
      Message: "message",
      Resolution: "fix",
      AVDID: "legacy",
      PrimaryURL: "https://example.test/primary",
      References: ["https://example.test/reference"],
      CauseMetadata: cause,
    });
    if (field === "Lines") cause.Code = { Lines: bad };
    else if (field === "Content")
      cause.Code = {
        Lines: [{ Content: "code first" }, { Content: bad }, null, { Content: "code last" }],
      };
    else if (["Resource", "Code", "Occurrences"].includes(field)) cause[field] = bad;
    else Object.assign(item, { [field]: bad });
    const { candidates, log } = await normalize(report([result({ Misconfigurations: [item] })]));
    expect(candidates).toHaveLength(1);
    const candidate = candidates[0];
    expect(candidate).toMatchObject({
      title: field === "Title" ? item.ID : "title",
      description: field === "Description" ? null : "description",
      remediation: field === "Resolution" ? null : "fix",
      severity: "high",
    });
    expect(weaknessSchema.parse(candidate.weakness)).toEqual(
      weaknessSchema.parse({
        identifiers: { trivy: [item.ID, ...(field === "AVDID" ? [] : ["legacy"])] },
        references: [
          ...(field === "PrimaryURL" ? [] : ["https://example.test/primary"]),
          ...(field === "References" ? [] : ["https://example.test/reference"]),
        ],
      }),
    );
    expect(candidate.affectedResource).toEqual({
      type: "sourceCode",
      file: "main.tf",
      ...(field === "CauseMetadata" ? {} : { location: { startLine: 7, endLine: 9 } }),
      ...(["CauseMetadata", "Resource"].includes(field) ? {} : { symbol: "symbol" }),
    });
    if (field !== "Message") expect(candidate.evidence).toContain(renderCodeBlock("message"));
    else expect(candidate.evidence).not.toContain(renderCodeBlock("message"));
    if (!["CauseMetadata", "Code", "Lines"].includes(field))
      expect(candidate.evidence).toContain(renderCodeBlock("code first\ncode last"));
    if (!["CauseMetadata", "Occurrences"].includes(field))
      expect(candidate.evidence).toContain("parent.tf");
    expect(provenance(candidate).result).toEqual(item);
    expect(log.warn).toHaveBeenCalled();
    expect(JSON.stringify(log.warn.mock.calls)).not.toContain("SECRET");
  });

  it("preserves unknown-only optional objects without treating absent mapped fields as malformed", async () => {
    const unknown = { "SECRET-key": ["SECRET-value"] };
    for (const CauseMetadata of [
      unknown,
      { Code: unknown },
      { Occurrences: [{ Location: unknown }] },
    ]) {
      const item = detection({ CauseMetadata });
      const { candidates, log } = await normalize(report([result({ Misconfigurations: [item] })]));
      expect(candidates).toHaveLength(1);
      expect(candidates[0].evidence).toBeNull();
      expect(candidates[0].affectedResource).toEqual({ type: "sourceCode", file: "main.tf" });
      expect(provenance(candidates[0]).result).toEqual(item);
      expect(log.warn).not.toHaveBeenCalled();
    }
  });

  it("retains native aliases and valid standard IDs, recovering bad optional entries individually", async () => {
    const item = detection({
      ID: " cve-2026-12345 ",
      AVDID: "ghsa-abcd-2345-6789",
      CweIDs: ["cwe-079", "79", "CWE-89", "CWE-0", "SECRET-cwe", 42, {}],
      PrimaryURL: "https://example.test/primary",
      References: [
        "https://example.test/second",
        "https://example.test/primary",
        null,
        42,
        { SECRET: true },
        "",
        "https://example.test/third",
      ],
    });
    const { candidates, log } = await normalize(
      report([
        result({
          Misconfigurations: [
            item,
            detection({
              ID: "CVE-not-standard",
              AVDID: ["SECRET-alias"],
              CweIDs: "SECRET-cwe-list",
            }),
          ],
        }),
      ]),
    );
    expect(candidates).toHaveLength(2);
    expect(weaknessSchema.parse(candidates[0].weakness)).toEqual({
      identifiers: {
        trivy: ["cve-2026-12345", "ghsa-abcd-2345-6789"],
        cve: ["CVE-2026-12345"],
        ghsa: ["GHSA-ABCD-2345-6789"],
        cwe: ["CWE-79", "CWE-89"],
      },
      references: [
        "https://example.test/primary",
        "https://example.test/second",
        "https://example.test/third",
      ],
    });
    expect(candidates[1].weakness).toEqual({ identifiers: { trivy: ["CVE-not-standard"] } });
    expect(provenance(candidates[0]).result).toEqual(item);
    expect(log.warn).toHaveBeenCalled();
  });

  it("maps only explicit severity, UNKNOWN to info, and warns for every unusable severity", async () => {
    for (const Severity of [
      "CRITICAL",
      "HIGH",
      "MEDIUM",
      "LOW",
      "INFO",
      "UNKNOWN",
      undefined,
      null,
      "",
      "high",
      "constructor",
      "SECRET-severity",
      42,
      true,
      [],
      {},
    ]) {
      const known =
        typeof Severity === "string" &&
        ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO", "UNKNOWN"].includes(Severity);
      const { candidates, log } = await normalize(
        report([
          result({
            Misconfigurations: [
              detection({
                Severity,
                Title: "CRITICAL",
                CVSS: { vendor: { V3Score: 10 } },
                VendorSeverity: { vendor: 4 },
                SeveritySource: "vendor",
                RiskScore: 10,
              }),
            ],
          }),
        ]),
      );
      expect(candidates[0].severity).toBe(
        known && Severity !== "UNKNOWN" ? Severity.toLowerCase() : "info",
      );
      expect(log.warn).toHaveBeenCalledTimes(known ? 0 : 1);
    }
  });

  it("recovers coordinates without synthetic lines/columns or using code/occurrence coordinates", async () => {
    for (const [StartLine, EndLine, location] of [
      [undefined, undefined, undefined],
      [undefined, 9, undefined],
      [0, 9, undefined],
      [null, 9, undefined],
      [-1, 9, undefined],
      [1.5, 9, undefined],
      ["7", 9, undefined],
      [7, undefined, { startLine: 7 }],
      [7, null, { startLine: 7 }],
      [7, 0, { startLine: 7 }],
      [7, 6, { startLine: 7 }],
      [7, "9", { startLine: 7 }],
      [7, 9.5, { startLine: 7 }],
      [7, 7, { startLine: 7, endLine: 7 }],
      [7, 9, { startLine: 7, endLine: 9 }],
    ] as const) {
      const CauseMetadata = {
        StartLine,
        EndLine,
        Resource: "symbol",
        Code: { Lines: [{ Number: 100, Content: "code" }] },
        Occurrences: [{ Filename: "parent.tf", Location: { StartLine: 200 } }],
      };
      const { candidates } = await normalize(
        report([result({ Misconfigurations: [detection({ CauseMetadata })] })]),
      );
      expect(candidates[0].affectedResource).toEqual({
        type: "sourceCode",
        file: "main.tf",
        symbol: "symbol",
        ...(location ? { location } : {}),
      });
      expect(provenance(candidates[0]).result.CauseMetadata).toEqual(
        JSON.parse(JSON.stringify(CauseMetadata)),
      );
    }
  });

  it("renders source text in safe blocks, preserving code order and partial context rather than highlights", async () => {
    const message = "  message\r\n```\n</summary><script>source</script>\n";
    const contents = ["  first ````", "", "last\r\n" + "long source line\n".repeat(100)];
    const CauseMetadata = {
      StartLine: 2,
      EndLine: 200,
      Code: {
        Lines: contents.map((Content, index) => ({
          Number: 100 - index,
          Content,
          Highlighted: "\u001b[31mSECRET-highlight",
          IsCause: true,
          Annotation: "SECRET-annotation",
          Truncated: true,
        })),
      },
      Occurrences: [
        {
          Resource: "parent```",
          Filename: "../parent/other.tf",
          Location: { StartLine: 40, EndLine: 42 },
        },
      ],
    };
    const { candidates } = await normalize(
      report([
        result({
          Misconfigurations: [
            detection({ Message: message, CauseMetadata, Resolution: "fix verbatim```\n" }),
          ],
        }),
      ]),
    );
    expect(candidates[0].evidence).toContain(renderCodeBlock(message));
    expect(candidates[0].evidence).toContain(renderCodeBlock(contents.join("\n")));
    expect(candidates[0].evidence).toContain(
      `\n\n\`\`\`\`\`\n${contents.join("\n")}\n\`\`\`\`\`\n`,
    );
    expect(candidates[0].evidence).toContain(
      renderCodeBlock("Resource: parent```\nFile: ../parent/other.tf\nLines: 40-42"),
    );
    expect(candidates[0].evidence).not.toContain("SECRET");
    expect(candidates[0].evidence).not.toContain("\u001b");
    expect(candidates[0].remediation).toBe("fix verbatim```\n");
    expect(provenance(candidates[0]).result.CauseMetadata).toEqual(CauseMetadata);
  });

  it("recovers message, code, and additional occurrence components independently", async () => {
    for (const [Message, CauseMetadata, content] of [
      ["message only", undefined, "message only"],
      [{ SECRET: true }, { Code: { Lines: [{ Content: "code only" }] } }, "code only"],
      [
        undefined,
        {
          Code: null,
          Occurrences: [{ Resource: "parent only", Filename: 42, Location: { StartLine: -1 } }],
        },
        "Resource: parent only",
      ],
      [
        undefined,
        {
          Occurrences: [
            { Resource: {}, Filename: "other.tf", Location: { StartLine: "bad", EndLine: 9 } },
          ],
        },
        "File: other.tf",
      ],
      [
        undefined,
        { Occurrences: [{ Filename: null, Location: { StartLine: 7, EndLine: 3 } }] },
        "Lines: 7",
      ],
      [undefined, { Occurrences: [{ Location: { StartLine: 7, EndLine: 7 } }] }, "Lines: 7"],
      [
        undefined,
        {
          Occurrences: [
            null,
            42,
            {},
            { Filename: "survivor.tf", Location: { StartLine: 7, EndLine: 9 } },
          ],
        },
        "File: survivor.tf\nLines: 7-9",
      ],
    ] as const) {
      const { candidates } = await normalize(
        report([
          result({ Misconfigurations: [detection({ Message, CauseMetadata, Resolution: "fix" })] }),
        ]),
      );
      expect(candidates).toHaveLength(1);
      expect(candidates[0].evidence).toContain(renderCodeBlock(content));
      expect(candidates[0].affectedResource).toEqual({ type: "sourceCode", file: "main.tf" });
      expect(candidates[0].remediation).toBe("fix");
    }
    const { candidates, log } = await normalize(
      report([
        result({
          Misconfigurations: [
            detection({
              Message: {},
              CauseMetadata: { Code: { Lines: [null, { Content: {} }] }, Occurrences: [null, {}] },
              Resolution: {},
            }),
          ],
        }),
      ]),
    );
    expect(candidates[0]).toMatchObject({ evidence: null, remediation: null });
    expect(log.warn).toHaveBeenCalled();
  });

  it("recovers malformed occurrence Location without losing its resource/file or sibling context", async () => {
    for (const Location of [null, "SECRET-location", 42, true, []]) {
      const CauseMetadata = {
        StartLine: 7,
        EndLine: 9,
        Occurrences: [
          { Resource: "parent", Filename: "parent.tf", Location },
          { Filename: "other.tf", Location: { StartLine: 40, EndLine: 42 } },
        ],
      };
      const { candidates, log } = await normalize(
        report([result({ Misconfigurations: [detection({ CauseMetadata })] })]),
      );
      expect(candidates).toHaveLength(1);
      expect(candidates[0].evidence).toContain(
        renderCodeBlock("Resource: parent\nFile: parent.tf"),
      );
      expect(candidates[0].evidence).toContain(renderCodeBlock("File: other.tf\nLines: 40-42"));
      expect(candidates[0].affectedResource).toEqual({
        type: "sourceCode",
        file: "main.tf",
        location: { startLine: 7, endLine: 9 },
      });
      expect(provenance(candidates[0]).result.CauseMetadata).toEqual(CauseMetadata);
      expect(log.warn).toHaveBeenCalled();
      expect(JSON.stringify(log.warn.mock.calls)).not.toContain("SECRET");
    }
  });

  it("canonicalizes explicit image/repository metadata and deduplicates repository-only image identity", async () => {
    const digest = `sha256:${"a".repeat(64)}`;
    const Metadata = {
      Reference: "registry.example.com:5000/team/app:latest",
      RepoTags: [
        "REGISTRY.example.com:5000/team/app:v1",
        "registry.example.com:5000/team/app:v2",
        "nginx:alpine",
      ],
      RepoDigests: [
        `registry.example.com:5000/team/app@${digest}`,
        `mirror.example.com/team/app@${digest}`,
      ],
      RepoURL: "git@GitHub.com:Org/Repo.git",
      Branch: "main",
      Commit: "reported-revision",
    };
    const { candidates, log } = await normalize(
      report(undefined, {
        Metadata,
        ArtifactName: "/tmp/image.tar",
        ArtifactType: "container_image",
      }),
    );
    expect(candidates[0].assetIdentifierCandidates).toHaveLength(4);
    expect(candidates[0].assetIdentifierCandidates).toEqual(
      expect.arrayContaining([
        { type: "ociImageName", namespace: null, value: "registry.example.com:5000/team/app" },
        { type: "ociImageName", namespace: null, value: "nginx" },
        { type: "ociImageName", namespace: null, value: "mirror.example.com/team/app" },
        { type: "vcsRepository", namespace: null, value: "github.com/Org/Repo" },
      ]),
    );
    expect(provenance(candidates[0]).document.Metadata).toEqual(Metadata);
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("recovers invalid asset entries/collections independently without classifier candidate loss", async () => {
    for (const Metadata of [
      {
        RepoURL: "https://user:SECRET-password@github.com/Org/Repo",
        RepoTags: ["nginx:latest", "https://SECRET-host/image", 42, {}],
      },
      {
        RepoURL: "https://github.com/Org/Repo.git",
        RepoTags: { SECRET: true },
        RepoDigests: ["SECRET-digest", null],
      },
      {
        RepoURL: { SECRET: true },
        RepoDigests: [`registry.example.com/team/app@sha256:${"b".repeat(64)}`],
        Reference: { SECRET: true },
      },
    ]) {
      const { candidates, log } = await normalize(
        report([result({ Misconfigurations: [detection(), detection()] })], { Metadata }),
      );
      expect(candidates).toHaveLength(2);
      const expected =
        typeof Metadata.RepoURL === "string" && Metadata.RepoURL.endsWith(".git")
          ? { type: "vcsRepository", namespace: null, value: "github.com/Org/Repo" }
          : {
              type: "ociImageName",
              namespace: null,
              value: Array.isArray(Metadata.RepoTags) ? "nginx" : "registry.example.com/team/app",
            };
      for (const candidate of candidates)
        expect(candidate.assetIdentifierCandidates).toEqual([expected]);
      expect(log.warn).toHaveBeenCalled();
      expect(JSON.stringify(log.warn.mock.calls)).not.toContain("SECRET");
    }
  });

  it.each(["Reference", "RepoTags", "RepoDigests"])(
    "rejects malformed qualifiers and digest-only %s without repairing them into image names",
    async (field) => {
      for (const value of [
        "registry.example.com/team/app:",
        "registry.example.com/team/app:.bad",
        "registry.example.com/team/app:bad tag",
        `registry.example.com/team/app:${"a".repeat(129)}`,
        "registry.example.com/team/app@",
        "registry.example.com/team/app@sha256:SECRET-not-hex",
        ...[32, 63, 65].map(
          (length) => `registry.example.com/team/app@sha256:${"a".repeat(length)}`,
        ),
        `registry.example.com/team/app@sha256:${"a".repeat(64)}@extra`,
        `sha256:${"a".repeat(64)}`,
        "a".repeat(64),
      ]) {
        const Metadata = {
          RepoURL: "https://github.com/Org/Repo.git",
          [field]: field === "Reference" ? value : [value],
        };
        const { candidates, log } = await normalize(report(undefined, { Metadata }));
        expect(candidates).toHaveLength(1);
        expect(candidates[0].assetIdentifierCandidates).toEqual([
          { type: "vcsRepository", namespace: null, value: "github.com/Org/Repo" },
        ]);
        expect(provenance(candidates[0]).document.Metadata).toEqual(Metadata);
        expect(log.warn).toHaveBeenCalled();
        expect(JSON.stringify(log.warn.mock.calls)).not.toContain(value);
      }
    },
  );

  it("does not infer identity from artifact names, paths, standalone digests, or Terraform context", async () => {
    for (const [ArtifactType, ArtifactName] of [
      ["filesystem", "/local/checkout"],
      ["repository", "../repo"],
      ["container_image", "image.tar"],
      ["container_image", "nginx:latest"],
      ["future", ""],
      ["", ""],
    ]) {
      const { candidates } = await normalize(
        report(
          [
            result({
              Target: "github.com/Org/Repo/main.tf",
              Misconfigurations: [
                detection({ CauseMetadata: { Resource: "aws_s3_bucket.bucket", Provider: "aws" } }),
              ],
            }),
          ],
          {
            ArtifactType,
            ArtifactName,
            ArtifactID: "SECRET-artifact",
            Metadata: {
              ImageID: `sha256:${"a".repeat(64)}`,
              DiffIDs: [`sha256:${"b".repeat(64)}`],
              Branch: "main",
              Commit: "revision",
            },
          },
        ),
      );
      expect(candidates[0].assetIdentifierCandidates).toEqual([]);
    }
    const { candidates } = await normalize(
      report(undefined, {
        Metadata: { Reference: `sha256:${"a".repeat(64)}`, RepoURL: "/local/repo" },
      }),
    );
    expect(candidates[0].assetIdentifierCandidates).toEqual([]);
  });

  it.each([
    ["2026-09-16T18:57:33.949652717Z", "2026-09-16T18:57:33.949Z"],
    ["2024-02-29T23:30:12.123456789+05:30", "2024-02-29T18:00:12.123Z"],
    ["2000-02-29T00:00:00-04:00", "2000-02-29T04:00:00.000Z"],
  ])("uses report CreatedAt %s and preserves its raw precision", async (CreatedAt, expected) => {
    const { candidates, log } = await normalize(
      report([result({ Misconfigurations: [detection(), detection()] }), result()], { CreatedAt }),
    );
    expect(candidates).toHaveLength(3);
    for (const candidate of candidates) {
      expect(candidate.observedAt?.toISOString()).toBe(expected);
      expect(provenance(candidate).document.CreatedAt).toBe(CreatedAt);
    }
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("recovers missing/unusable timestamps without substituting advisory dates or the clock", async () => {
    for (const CreatedAt of [
      undefined,
      null,
      "",
      " ",
      0,
      true,
      {},
      [],
      "SECRET-time",
      "2026-01-01",
      "2026-01-01T00:00:00",
      "2026-02-30T00:00:00Z",
      "2025-02-29T00:00:00+01:00",
      "2026-01-01T24:00:00Z",
      "2026-01-01T00:00:00+24:00",
    ]) {
      const { candidates, log } = await normalize(
        report(
          [
            result({
              Misconfigurations: [
                detection({
                  PublishedDate: "2026-01-01T00:00:00Z",
                  LastModifiedDate: "2026-01-02T00:00:00Z",
                }),
              ],
            }),
          ],
          { CreatedAt, Metadata: { ImageConfig: { created: "2026-01-03T00:00:00Z" } } },
        ),
      );
      expect(candidates[0].observedAt).toBeNull();
      expect(log.warn).toHaveBeenCalledTimes(CreatedAt === undefined ? 0 : 1);
    }
  });

  it("isolates mutable asset identifiers and observation dates across candidates and repeated calls", async () => {
    const CreatedAt = "2026-09-16T18:57:33.949Z";
    const input = bytes(
      report([result({ Misconfigurations: [detection(), detection()] }), result()], {
        CreatedAt,
        Metadata: { RepoURL: "https://github.com/Org/Repo.git", RepoTags: ["nginx:latest"] },
      }),
    );
    const original = input.slice();
    const { candidates } = await run(input);
    expect(candidates).toHaveLength(3);
    const expected = structuredClone(candidates);
    candidates[0].assetIdentifierCandidates[0].value = "changed";
    candidates[0].assetIdentifierCandidates.pop();
    expect(candidates[0].observedAt).toEqual(new Date(CreatedAt));
    candidates[0].observedAt?.setTime(0);
    expect(candidates.slice(1)).toEqual(expected.slice(1));
    expect((await run(input)).candidates).toEqual(expected);
    expect(input).toEqual(original);
  });

  it("owns mutable context and logs only structural diagnostics, never source-controlled values or keys", async () => {
    const unknown = { "SECRET-arbitrary-key": ["SECRET-value"] };
    const item = detection({
      ID: "SECRET-id",
      Title: unknown,
      Description: unknown,
      Message: unknown,
      Resolution: unknown,
      Severity: "SECRET-severity",
      PrimaryURL: unknown,
      CweIDs: ["SECRET-cwe"],
      CauseMetadata: {
        Resource: "SECRET-symbol",
        StartLine: unknown,
        Code: { Lines: [{ Content: unknown, Highlighted: "SECRET-code" }] },
        Occurrences: [{ Filename: unknown, Location: "SECRET-location" }],
      },
      unknown,
    });
    const scanResult = {
      Target: "SECRET-path",
      Class: "SECRET-class",
      Type: "SECRET-type",
      unknown,
    };
    const document = {
      SchemaVersion: 2,
      ArtifactName: "SECRET-artifact",
      ArtifactType: "SECRET-artifact-type",
      CreatedAt: "SECRET-time",
      Metadata: { RepoURL: unknown },
      unknown,
      ["__proto__"]: unknown,
    };
    const raw = report(
      [
        {
          ...scanResult,
          Misconfigurations: [item, item],
          Vulnerabilities: [],
          Packages: [unknown],
          Secrets: [],
          ExperimentalModifiedFindings: [],
        },
        { ...scanResult, Misconfigurations: [item] },
      ],
      document,
    );
    const input = bytes(raw);
    const original = input.slice();
    const { candidates, log } = await run(input);
    expect(candidates).toHaveLength(3);
    for (const candidate of candidates)
      expect(candidate.sourceMetadata).toEqual({
        provenance: { document, scanResult, result: item },
      });
    for (const scope of ["document", "scanResult", "result"] as const) {
      (provenance(candidates[0])[scope].unknown as typeof unknown)["SECRET-arbitrary-key"].push(
        "changed",
      );
    }
    for (const candidate of candidates.slice(1))
      expect(provenance(candidate)).toEqual({ document, scanResult, result: item });
    expect(unknown["SECRET-arbitrary-key"]).toEqual(["SECRET-value"]);
    expect(input).toEqual(original);
    expect(Object.hasOwn(provenance(candidates[0]).document, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(provenance(candidates[0]).document)).toBe(Object.prototype);
    expect(log.warn).toHaveBeenCalled();
    expect(
      JSON.stringify([log.warn.mock.calls, log.info.mock.calls, log.debug.mock.calls]),
    ).not.toContain("SECRET");
    for (const [fields, message] of log.warn.mock.calls) {
      expect(message).toMatch(/^trivy: /u);
      expect(
        Object.keys(fields).every((key) => ["sourceRecord", "field", "count"].includes(key)),
      ).toBe(true);
      expect(typeof fields.field).toBe("string");
      for (const part of (fields.field as string).split(/[/.]/u)) {
        expect(
          /^[0-9]+$/u.test(part) ||
            [
              "CreatedAt",
              "Metadata",
              "RepoURL",
              "Title",
              "Description",
              "Message",
              "Resolution",
              "Severity",
              "PrimaryURL",
              "CweIDs",
              "CauseMetadata",
              "StartLine",
              "Code",
              "Lines",
              "Content",
              "Occurrences",
              "Location",
              "Filename",
            ].includes(part),
        ).toBe(true);
      }
      if (fields.sourceRecord !== undefined)
        expect(fields.sourceRecord).toMatch(/^\/Results\/\d+(?:\/Misconfigurations\/\d+)?$/u);
    }
  });
});

it("lets classifier registration stamp trivy and canonicalize native weakness identifiers", async () => {
  const log = logger();
  const classifier = new Classifier(log as unknown as Logger);
  classifier.registerNormalizer("trivy", {
    async normalize(input, logger) {
      return (await normalizer.normalize(input, logger)).map((candidate) => ({
        ...candidate,
        source: "unstamped",
      }));
    },
  });
  const input = bytes(
    report([
      result({
        Misconfigurations: [
          detection({ ID: " custom/RULE:1 ", AVDID: " legacy ", CweIDs: ["cwe-079"] }),
        ],
      }),
    ]),
  );
  const direct = await normalizer.normalize(input, log as unknown as Logger);
  const candidates = await classifier.normalize("trivy", input);
  expect(candidates).toEqual([
    { ...direct[0], source: "trivy", weakness: weaknessSchema.parse(direct[0].weakness) },
  ]);
  expect(candidates[0].weakness.identifiers).toEqual({
    trivy: ["custom/RULE:1", "legacy"],
    cwe: ["CWE-79"],
  });
  expect(log.warn).not.toHaveBeenCalled();
});
