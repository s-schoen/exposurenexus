import { readFileSync } from "node:fs";

import { assetIdentifierSchema } from "@exposurenexus/backend/assets";
import { weaknessSchema } from "@exposurenexus/backend/findings";
import { observationAffectedResourceSchema } from "@exposurenexus/contracts/model/affected-resource";
import { describe, expect, it, vi } from "vitest";

import { Classifier } from "../classifier.js";
import { renderCodeBlock, renderEvidenceSection } from "./shared.js";
import { TrivyNormalizer } from "./trivy.js";

import type { Normalizer, ObservationCandidate } from "../classifier.js";
import type { Logger } from "pino";

const normalizer: Normalizer = new TrivyNormalizer();
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));

// Except for the attributed fixtures below, all inputs are constructed edge cases.
const detection = (overrides: Record<string, unknown> = {}) => ({
  VulnerabilityID: "vendor/advisory:1",
  PkgName: "reported-package",
  Severity: "HIGH",
  ...overrides,
});
const result = (overrides: Record<string, unknown> = {}) => ({
  Target: "",
  Class: "future-class",
  Type: "future-analyzer",
  Vulnerabilities: [detection()],
  ...overrides,
});
const report = (Results: unknown = [result()], context: Record<string, unknown> = {}) => ({
  SchemaVersion: 2,
  ArtifactName: "/local/checkout",
  ArtifactType: "filesystem",
  Results,
  ...context,
});
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

describe.each(["direct", "classifier"] as const)("Trivy packages %s", (mode) => {
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

  it.each(["alpine", "language"] as const)(
    "preserves the complete upstream %s package report",
    async (fixture) => {
      // Unmodified upstream golden reports; source pins and attribution: fixtures/trivy-packages.md.
      const input = readFileSync(new URL(`./fixtures/trivy-${fixture}.json`, import.meta.url));
      const original = Buffer.from(input);
      type Detection = {
        VulnerabilityID: string;
        PkgName: string;
        InstalledVersion: string;
        FixedVersion: string;
        Status: string;
        Title: string;
        Description: string;
        Severity: string;
        CweIDs: string[];
        PrimaryURL: string;
        References: string[];
        CVSS: Record<
          string,
          { V2Score: number; V2Vector: string; V3Score: number; V3Vector: string }
        >;
      };
      const raw = JSON.parse(input.toString("utf8")) as {
        Trivy: { Version: string };
        Results: Array<Record<string, unknown> & { Vulnerabilities?: Detection[] }>;
      };
      const { Results, ...document } = raw;
      expect(raw.Trivy.Version).toBe("dev");
      expect(Results).toHaveLength(fixture === "alpine" ? 1 : 2);
      if (fixture === "language") expect(Results[1].Vulnerabilities).toBeUndefined();
      const { candidates, log } = await run(input);
      expect(candidates).toHaveLength(fixture === "alpine" ? 4 : 2);
      expect(candidates.map((candidate) => candidate.remediation)).toEqual(
        (fixture === "alpine"
          ? ["1.1.1d-r0", "1.1.1d-r2", "1.1.1d-r0", "1.1.1d-r2"]
          : [">= 2.1.0", ">= 3.1.0, >= 2.1.3, < 3.0.0"]
        ).map((fixed) => renderEvidenceSection("Reported fixed version(s)", fixed)),
      );
      let index = 0;
      for (const [r, group] of Results.entries()) {
        const { Vulnerabilities, ...scanResult } = group;
        for (const [v, item] of (Vulnerabilities ?? []).entries()) {
          const candidate = candidates[index++];
          const nvd = item.CVSS.nvd;
          const redhat = item.CVSS.redhat;
          expect(item.Status).toBe("fixed");
          expect(candidate).toMatchObject({
            sourceRecord: `/Results/${r}/Vulnerabilities/${v}`,
            title: item.Title,
            description: item.Description,
            severity: item.Severity.toLowerCase(),
            observedAt: new Date("2021-08-25T12:20:30.000Z"),
            assetIdentifierCandidates: [
              fixture === "alpine"
                ? {
                    type: "ociImageName",
                    namespace: null,
                    value: "ghcr.io/aquasecurity/trivy-test-images",
                  }
                : {
                    type: "vcsRepository",
                    namespace: null,
                    value: "github.com/knqyf263/trivy-ci-test",
                  },
            ],
          });
          expect(candidate.affectedResource).toEqual({
            type: "package",
            name: item.PkgName,
            version: item.InstalledVersion,
            ecosystem: fixture === "alpine" ? "apk" : "cargo",
          });
          expect(weaknessSchema.parse(candidate.weakness)).toEqual({
            identifiers: {
              trivy: [item.VulnerabilityID],
              cve: [item.VulnerabilityID],
              cwe: item.CweIDs,
            },
            references: [item.PrimaryURL, ...item.References],
            cvss: [
              { version: "2.0", score: nvd.V2Score, vector: nvd.V2Vector },
              {
                version: fixture === "language" && v === 0 ? "3.0" : "3.1",
                score: nvd.V3Score,
                vector: nvd.V3Vector,
              },
              ...(fixture === "alpine"
                ? [
                    {
                      version: v % 2 === 0 ? "3.0" : "3.1",
                      score: redhat.V3Score,
                      vector: redhat.V3Vector,
                    },
                  ]
                : []),
            ],
          });
          expect(candidate.evidence).toEqual(
            [
              renderEvidenceSection("Package", item.PkgName),
              renderEvidenceSection("Installed version", item.InstalledVersion),
              renderEvidenceSection("Advisory status", "fixed"),
            ].join("\n\n"),
          );
          expect(candidate.remediation).toContain(renderCodeBlock(item.FixedVersion));
          expect(candidate.sourceMetadata).toEqual({
            provenance: { document, scanResult, result: item },
          });
        }
      }
      expect(log.warn).not.toHaveBeenCalled();
      expect(input).toEqual(original);
    },
  );

  it("accepts minimal packages, empty/missing targets, and missing or empty supported arrays", async () => {
    for (const Target of [undefined, "", " \n"]) {
      const { candidates, log } = await normalize(report([result({ Target })]));
      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toMatchObject({
        sourceRecord: "/Results/0/Vulnerabilities/0",
        title: "vendor/advisory:1",
        description: null,
        severity: "high",
        weakness: { identifiers: { trivy: ["vendor/advisory:1"] } },
        affectedResource: { type: "package", name: "reported-package" },
        observedAt: null,
        assetIdentifierCandidates: [],
        evidence: renderEvidenceSection("Package", "reported-package"),
        remediation: null,
      });
      expect(candidates[0].affectedResource).toEqual({ type: "package", name: "reported-package" });
      expect(candidates[0].weakness.cvss).toBeUndefined();
      expect(log.warn).not.toHaveBeenCalled();
    }
    for (const Vulnerabilities of [undefined, []]) {
      const { candidates, log } = await normalize(report([result({ Vulnerabilities })]));
      expect(candidates).toEqual([]);
      expect(log.warn).not.toHaveBeenCalled();
    }
  });

  it("preserves duplicates and original locators, traversing packages before IaC regardless of member order", async () => {
    const item = detection({ Status: "fixed" });
    const misconfiguration = { ID: "rule", Status: "FAIL", Severity: "LOW" };
    const { candidates } = await normalize(
      report([
        result({ Vulnerabilities: [] }),
        {
          Target: "main.tf",
          Misconfigurations: [{ Status: "PASS" }, misconfiguration, { Status: "EXCEPTION" }],
          Vulnerabilities: [item, item],
          Packages: [{ Name: "inventory-only", Version: "99" }],
          ExperimentalModifiedFindings: [{ Vulnerability: item }],
          MisconfSummary: { Failures: 999, Successes: 0 },
        },
        result({ Vulnerabilities: [detection({ VulnerabilityID: "last" })] }),
      ]),
    );
    expect(candidates.map((candidate) => candidate.sourceRecord)).toEqual([
      "/Results/1/Vulnerabilities/0",
      "/Results/1/Vulnerabilities/1",
      "/Results/1/Misconfigurations/1",
      "/Results/2/Vulnerabilities/0",
    ]);
    expect(candidates[0]).toEqual({ ...candidates[1], sourceRecord: candidates[0].sourceRecord });
    expect(candidates[2].affectedResource.type).toBe("sourceCode");
    expect(candidates[3].title).toBe("last");
    expect(provenance(candidates[0]).scanResult).toEqual({
      Target: "main.tf",
      MisconfSummary: { Failures: 999, Successes: 0 },
    });
  });

  it("fails atomically for malformed arrays, entries, essential package fields, and cross-family errors", async () => {
    const invalid = [undefined, null, "", " \n\t", 42, true, [], { "SECRET-key": true }];
    const badRecords = [
      null,
      [],
      42,
      true,
      "SECRET-record",
      ...["VulnerabilityID", "PkgName"].flatMap((field) =>
        invalid.map((value) => detection({ [field]: value })),
      ),
    ];
    const iac = { Target: "main.tf", Misconfigurations: [{ ID: "rule", Status: "FAIL" }] };
    const cases: Array<[unknown, string]> = [
      ...[null, {}, 42, true, "SECRET-array"].map((Vulnerabilities): [unknown, string] => [
        report([result(), result({ Vulnerabilities })]),
        "/Results/1/Vulnerabilities",
      ]),
      ...badRecords.map((bad): [unknown, string] => [
        report([result({ Vulnerabilities: [detection(), bad] })]),
        "/Results/0/Vulnerabilities/1",
      ]),
      [
        report([iac, result({ Vulnerabilities: [detection({ PkgName: null })] })]),
        "/Results/1/Vulnerabilities/0",
      ],
      [
        report([
          result(),
          { ...iac, Misconfigurations: [{ ID: "SECRET-id", Status: "SECRET-status" }] },
        ]),
        "/Results/1/Misconfigurations/0",
      ],
      [report([result({ ...iac, Misconfigurations: null })]), "/Results/0/Misconfigurations"],
      [
        report([result({ ...iac, Misconfigurations: [{ Status: "FAIL" }] })]),
        "/Results/0/Misconfigurations/0",
      ],
      [
        report([result({ ...iac, Vulnerabilities: [detection({ VulnerabilityID: null })] })]),
        "/Results/0/Vulnerabilities/0",
      ],
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

  it("keeps every advisory status, with exact safe package evidence and fixed-version guidance", async () => {
    const PkgName = " @scope/package```\n<source> ";
    const InstalledVersion = " 1.0-r2\n```` ";
    const FixedVersion = " >= 3.1.0, >= 2.1.3, < 3.0.0; 1:2.0-4.el9\n``` ";
    for (const Status of [
      "fixed",
      "affected",
      "unfixed",
      "not_affected",
      "will_not_fix",
      "end_of_life",
      "unknown",
      "future-status```\n",
      undefined,
    ]) {
      const { candidates, log } = await normalize(
        report([
          result({
            Vulnerabilities: [
              detection({
                PkgName,
                InstalledVersion,
                FixedVersion,
                Status,
                Title: " Source title \n",
                Description: " Source description\r\n ",
              }),
            ],
          }),
        ]),
      );
      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toMatchObject({
        title: " Source title \n",
        description: " Source description\r\n ",
        severity: "high",
      });
      expect(candidates[0].affectedResource).toEqual({
        type: "package",
        name: PkgName,
        version: InstalledVersion,
      });
      expect(candidates[0].evidence).toBe(
        [
          renderEvidenceSection("Package", PkgName),
          renderEvidenceSection("Installed version", InstalledVersion),
          ...(Status === undefined ? [] : [renderEvidenceSection("Advisory status", Status)]),
        ].join("\n\n"),
      );
      expect(candidates[0].evidence).toContain(renderCodeBlock(PkgName));
      expect(candidates[0].evidence).toContain(renderCodeBlock(InstalledVersion));
      expect(candidates[0].remediation).toBe(
        renderEvidenceSection("Reported fixed version(s)", FixedVersion),
      );
      expect(log.warn).not.toHaveBeenCalled();
    }
  });

  it("treats unavailable optional text as absent without inferring fixes, versions, or paths", async () => {
    for (const value of [undefined, null, "", " \n\t"]) {
      const { candidates, log } = await normalize(
        report([
          result({
            Target: "package-lock.json",
            Type: "npm",
            Packages: [{ Name: "reported-package", Version: "inventory-version" }],
            Vulnerabilities: [
              detection({
                Title: value,
                Description: value,
                InstalledVersion: value,
                PkgPath: value,
                FixedVersion: value,
                Status: value,
                PrimaryURL: value,
                PkgIdentifier: { PURL: "pkg:npm/different-name@9.9.9#invented/path" },
              }),
            ],
          }),
        ]),
      );
      expect(candidates[0]).toMatchObject({
        title: "vendor/advisory:1",
        description: null,
        remediation: null,
        evidence: renderEvidenceSection("Package", "reported-package"),
      });
      expect(candidates[0].affectedResource).toEqual({
        type: "package",
        name: "reported-package",
        ecosystem: "npm",
      });
      expect(log.warn).not.toHaveBeenCalled();
    }
    const { candidates } = await normalize(
      report([result({ Vulnerabilities: [detection({ Status: "fixed" })] })]),
    );
    expect(candidates[0].remediation).toBeNull();
  });

  it.each([
    "Title",
    "Description",
    "InstalledVersion",
    "PkgPath",
    "FixedVersion",
    "Status",
    "PkgIdentifier",
    "PURL",
    "VendorIDs",
    "CweIDs",
    "PrimaryURL",
    "References",
    "CVSS",
  ])("recovers malformed %s independently and retains its raw value", async (field) => {
    const bad = { "SECRET-key": ["SECRET-value"] };
    const item = detection({
      Title: "title",
      Description: "description",
      InstalledVersion: "1.0",
      PkgPath: "archive.jar/lib/package",
      FixedVersion: "2.0, 1.1-r3",
      Status: "fixed",
      PkgIdentifier: { PURL: "pkg:npm/other@99" },
      VendorIDs: ["vendor-alias"],
      CweIDs: ["CWE-79"],
      PrimaryURL: "https://example.test/primary",
      References: ["https://example.test/reference"],
      CVSS: { vendor: { V3Score: 7 } },
      [field]: field === "PkgIdentifier" || field === "CVSS" ? "SECRET-non-object" : bad,
    });
    if (field === "PURL") Object.assign(item, { PkgIdentifier: { PURL: bad } });
    const { candidates, log } = await normalize(
      report([result({ Type: "pip", Vulnerabilities: [item] })]),
    );
    expect(candidates).toHaveLength(1);
    const candidate = candidates[0];
    expect(candidate).toMatchObject({
      title: field === "Title" ? item.VulnerabilityID : "title",
      description: field === "Description" ? null : "description",
      remediation:
        field === "FixedVersion"
          ? null
          : renderEvidenceSection("Reported fixed version(s)", "2.0, 1.1-r3"),
    });
    expect(candidate.affectedResource).toEqual({
      type: "package",
      name: "reported-package",
      ecosystem: ["PkgIdentifier", "PURL"].includes(field) ? "pypi" : "npm",
      ...(field === "InstalledVersion" ? {} : { version: "1.0" }),
      ...(field === "PkgPath" ? {} : { installationPath: "archive.jar/lib/package" }),
    });
    expect(candidate.evidence).toBe(
      [
        renderEvidenceSection("Package", "reported-package"),
        ...(field === "InstalledVersion"
          ? []
          : [renderEvidenceSection("Installed version", "1.0")]),
        ...(field === "Status" ? [] : [renderEvidenceSection("Advisory status", "fixed")]),
      ].join("\n\n"),
    );
    expect(weaknessSchema.parse(candidate.weakness)).toEqual({
      identifiers: {
        trivy: [...(field === "VendorIDs" ? [] : ["vendor-alias"]), item.VulnerabilityID],
        ...(field === "CweIDs" ? {} : { cwe: ["CWE-79"] }),
      },
      references: [
        ...(field === "PrimaryURL" ? [] : ["https://example.test/primary"]),
        ...(field === "References" ? [] : ["https://example.test/reference"]),
      ],
      ...(field === "CVSS" ? {} : { cvss: [{ score: 7 }] }),
    });
    expect(provenance(candidate).result).toEqual(item);
    expect(log.warn).toHaveBeenCalled();
    expect(JSON.stringify(log.warn.mock.calls)).not.toContain("SECRET");
  });

  it("retains opaque native IDs and individually recovers standard aliases, CWEs, and references", async () => {
    const item = detection({
      VulnerabilityID: " vendor/advisory:1 ",
      VendorIDs: [
        " cve-2026-12345 ",
        "ghsa-abcd-2345-6789",
        "vendor/advisory:1",
        "CVE-invalid",
        "GHSA-invalid",
        42,
        null,
        {},
        "",
      ],
      CweIDs: ["cwe-079", "79", "CWE-89", "CWE-0", "SECRET-cwe", 42, {}],
      PrimaryURL: " https://example.test/primary ",
      References: [
        "https://example.test/second",
        "https://example.test/primary",
        null,
        42,
        { SECRET: true },
        "",
        "https://example.test/third",
      ],
      DataSource: { ID: "source" },
      Fingerprint: "raw-fingerprint",
      VendorSeverity: { vendor: 4 },
    });
    const { candidates, log } = await normalize(
      report([
        result({
          Vulnerabilities: [
            item,
            detection({ VulnerabilityID: "ghsa-abcd-2345-6789" }),
            detection({ VulnerabilityID: "CVE-invalid" }),
          ],
        }),
      ]),
    );
    expect(candidates).toHaveLength(3);
    expect(weaknessSchema.parse(candidates[0].weakness)).toEqual({
      identifiers: {
        trivy: [
          "CVE-invalid",
          "GHSA-invalid",
          "cve-2026-12345",
          "ghsa-abcd-2345-6789",
          "vendor/advisory:1",
        ],
        cve: ["CVE-2026-12345"],
        ghsa: ["GHSA-ABCD-2345-6789"],
        cwe: ["CWE-79", "CWE-89"],
      },
      references: [
        " https://example.test/primary ",
        "https://example.test/second",
        "https://example.test/primary",
        "https://example.test/third",
      ],
    });
    expect(weaknessSchema.parse(candidates[1].weakness).identifiers).toEqual({
      trivy: ["ghsa-abcd-2345-6789"],
      ghsa: ["GHSA-ABCD-2345-6789"],
    });
    expect(candidates[2].weakness.identifiers).toEqual({ trivy: ["CVE-invalid"] });
    expect(provenance(candidates[0]).result).toEqual(item);
    expect(log.warn).toHaveBeenCalled();
    expect(JSON.stringify(log.warn.mock.calls)).not.toContain("SECRET");
  });

  it("uses only explicit severity, not CVSS, vendor severity, status, or fix availability", async () => {
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
            Vulnerabilities: [
              detection({
                Severity,
                CVSS: { vendor: { V3Score: 10 } },
                VendorSeverity: { vendor: 4 },
                SeveritySource: "vendor",
                Status: "fixed",
                FixedVersion: "2.0",
                RiskScore: 10,
              }),
            ],
          }),
        ]),
      );
      expect(candidates[0].severity).toBe(
        known && Severity !== "UNKNOWN" ? Severity.toLowerCase() : "info",
      );
      expect(candidates[0].weakness.cvss).toEqual([{ score: 10 }]);
      expect(candidates[0].weakness.epss).toBeUndefined();
      expect(log.warn).toHaveBeenCalledTimes(known ? 0 : 1);
    }
  });

  it.each([
    ["jar", "maven"],
    ["pom", "maven"],
    ["gradle", "maven"],
    ["pip", "pypi"],
    ["pipenv", "pypi"],
    ["poetry", "pypi"],
    ["gomod", "golang"],
    ["gobinary", "golang"],
    ["cargo", "cargo"],
    ["rustbinary", "cargo"],
    ["composer", "composer"],
    ["composer-vendor", "composer"],
    ["nuget", "nuget"],
    ["dotnet-core", "nuget"],
    ["packages-props", "nuget"],
    ["bundler", "gem"],
    ["gemspec", "gem"],
    ["conda-pkg", "conda"],
    ["conda-environment", "conda"],
    ["conan", "conan"],
    ["cocoapods", "cocoapods"],
    ["pub", "pub"],
    ["hex", "hex"],
    ["swift", "swift"],
    ["julia", "julia"],
    ["bitnami", "bitnami"],
    ["bottlerocket", "bottlerocket"],
    ["npm", "npm"],
    ["yarn", "npm"],
    ["pnpm", "npm"],
    ["alpine", "apk"],
    ["debian", "deb"],
    ["ubuntu", "deb"],
    ["redhat", "rpm"],
    ["centos", "rpm"],
    ["rocky", "rpm"],
    ["amazon", "rpm"],
  ])("uses the explicit %s fallback %s without a PURL", async (Type, ecosystem) => {
    const { candidates, log } = await normalize(report([result({ Type })]));
    expect(candidates[0].affectedResource).toEqual({
      type: "package",
      name: "reported-package",
      ecosystem,
    });
    expect(log.warn).not.toHaveBeenCalled();
  });

  it.each([
    ["pkg:npm/%40scope/other@9.9.9?repository_url=https%3A%2F%2Fexample.test#lib/file.js", "npm"],
    ["pkg:maven/org.example/other@9.9.9?classifier=sources&type=jar", "maven"],
    ["pkg:generic/other@9.9.9#lib/file", "generic"],
  ])(
    "prefers supplied PURL type without reconstructing identity, version, or path: %s",
    async (PURL, ecosystem) => {
      for (const InstalledVersion of [undefined, "source-version"]) {
        const item = detection({
          PkgIdentifier: { PURL },
          InstalledVersion,
          FixedVersion: "fix-version",
        });
        const { candidates, log } = await normalize(
          report([result({ Type: "alpine", Vulnerabilities: [item] })]),
        );
        expect(candidates[0].affectedResource).toEqual({
          type: "package",
          name: "reported-package",
          ecosystem,
          ...(InstalledVersion === undefined ? {} : { version: InstalledVersion }),
        });
        expect(candidates[0].assetIdentifierCandidates).toEqual([]);
        expect(provenance(candidates[0]).result).toEqual(JSON.parse(JSON.stringify(item)));
        expect(log.warn).not.toHaveBeenCalled();
      }
    },
  );

  it("recovers invalid PURLs with bounded fallbacks and leaves unknown ecosystems absent", async () => {
    for (const Type of ["pip", "future-python-analyzer", "constructor"]) {
      for (const PURL of ["SECRET-not-a-purl", "pkg:npm/", "pkg:npm/%ZZ", 42, {}]) {
        const { candidates, log } = await normalize(
          report([result({ Type, Vulnerabilities: [detection({ PkgIdentifier: { PURL } })] })]),
        );
        expect(candidates).toHaveLength(1);
        expect(candidates[0].affectedResource).toEqual({
          type: "package",
          name: "reported-package",
          ...(Type === "pip" ? { ecosystem: "pypi" } : {}),
        });
        expect(provenance(candidates[0]).result.PkgIdentifier).toEqual({ PURL });
        expect(log.warn).toHaveBeenCalled();
        expect(JSON.stringify(log.warn.mock.calls)).not.toContain("SECRET");
      }
    }
    for (const Type of [undefined, "", "future-python-analyzer", "constructor", "toString"]) {
      const { candidates, log } = await normalize(report([result({ Type })]));
      expect(candidates[0].affectedResource).toEqual({ type: "package", name: "reported-package" });
      expect(log.warn).not.toHaveBeenCalled();
    }
  });

  it("allows local-relative Go packages without PURLs and never treats a target as an installation path", async () => {
    for (const Target of ["Go", "go.mod", "/usr/bin/app", "./project", "bom.cdx.json"]) {
      const { candidates, log } = await normalize(
        report([
          result({
            Type: "gomod",
            Target,
            Vulnerabilities: [
              detection({ PkgName: "../local-module", InstalledVersion: "(devel)" }),
            ],
          }),
        ]),
      );
      expect(candidates[0].affectedResource).toEqual({
        type: "package",
        name: "../local-module",
        version: "(devel)",
        ecosystem: "golang",
      });
      expect(candidates[0].assetIdentifierCandidates).toEqual([]);
      expect(log.warn).not.toHaveBeenCalled();
    }
    for (const PkgPath of [
      "BOOT-INF/lib/example.jar/META-INF/maven/pom.properties",
      "C:\\app\\node_modules\\package.json",
      " ../package//metadata ",
    ]) {
      const { candidates } = await normalize(
        report([
          result({ Target: "not-a-package-path", Vulnerabilities: [detection({ PkgPath })] }),
        ]),
      );
      expect(candidates[0].affectedResource).toEqual({
        type: "package",
        name: "reported-package",
        installationPath: PkgPath,
      });
    }
  });

  it("retains all vendors and versions in first occurrence order, deduplicating assessments but not candidates", async () => {
    const v2 = "AV:N/AC:L/Au:N/C:P/I:N/A:N";
    const v30 = "CVSS:3.0/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H";
    const v31 = "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H";
    const v4 = "CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N";
    const CVSS = {
      first: { V2Score: 5, V2Vector: v2, V3Score: 9.8, V3Vector: v31, V40Score: 10, V40Vector: v4 },
      duplicate: {
        V2Score: 5,
        V2Vector: v2,
        V3Score: 9.8,
        V3Vector: v31,
        V40Score: 10,
        V40Vector: v4,
      },
      differentScore: { V3Score: 7.5, V3Vector: v31 },
      differentVector: { V3Score: 9.8, V3Vector: v30 },
      partial: { V2Score: 0, V3Score: 0, V40Vector: v4 },
      vectorOnly: { V2Vector: v2, V3Vector: v31, V40Score: 0 },
      versionless: { V3Vector: "AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H" },
      unknownMinor: { V3Vector: "CVSS:3.2/AV:N" },
      empty: {},
    };
    const item = detection({ CVSS, SeveritySource: "differentScore" });
    const { candidates, log } = await normalize(
      report([result({ Vulnerabilities: [item, item] })]),
    );
    expect(candidates).toHaveLength(2);
    for (const candidate of candidates) {
      expect(candidate.weakness.cvss).toEqual([
        { version: "2.0", score: 5, vector: v2 },
        { version: "3.1", score: 9.8, vector: v31 },
        { version: "4.0", score: 10, vector: v4 },
        { version: "3.1", score: 7.5, vector: v31 },
        { version: "3.0", score: 9.8, vector: v30 },
        { version: "2.0", score: 0 },
        { score: 0 },
        { version: "4.0", vector: v4 },
        { version: "2.0", vector: v2 },
        { version: "3.1", vector: v31 },
        { version: "4.0", score: 0 },
        { vector: CVSS.versionless.V3Vector },
        { vector: CVSS.unknownMinor.V3Vector },
      ]);
      expect(candidate.weakness.epss).toBeUndefined();
      expect(provenance(candidate).result.CVSS).toEqual(CVSS);
    }
    expect(log.warn).not.toHaveBeenCalled();
  });

  it.each([
    ["V2", "2.0", "AV:N/AC:L/Au:N/C:P/I:N/A:N"],
    ["V3", "3.1", "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N"],
    ["V40", "4.0", "CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H"],
  ])(
    "recovers %s score/vector components independently without invented zeroes or versions",
    async (slot, version, vector) => {
      for (const score of [undefined, null, -1, 10.1, "9.8", true, [], { "SECRET-score": true }]) {
        const CVSS = { vendor: { [`${slot}Score`]: score, [`${slot}Vector`]: vector } };
        const { candidates, log } = await normalize(
          report([result({ Vulnerabilities: [detection({ CVSS })] })]),
        );
        expect(candidates[0].weakness.cvss).toEqual([{ version, vector }]);
        if (score !== undefined) expect(log.warn).toHaveBeenCalled();
        expect(provenance(candidates[0]).result.CVSS).toEqual(JSON.parse(JSON.stringify(CVSS)));
      }
      for (const badVector of [
        undefined,
        null,
        "",
        " \n",
        42,
        true,
        [],
        { "SECRET-vector": true },
      ]) {
        const CVSS = { vendor: { [`${slot}Score`]: 0, [`${slot}Vector`]: badVector } };
        const { candidates } = await normalize(
          report([result({ Vulnerabilities: [detection({ CVSS })] })]),
        );
        expect(candidates[0].weakness.cvss).toEqual([
          { ...(slot === "V3" ? {} : { version }), score: 0 },
        ]);
      }
      const { candidates, log } = await normalize(
        report([
          result({
            Vulnerabilities: [
              detection({
                CVSS: { vendor: { [`${slot}Score`]: "SECRET-score", [`${slot}Vector`]: {} } },
              }),
            ],
          }),
        ]),
      );
      expect(candidates).toHaveLength(1);
      expect(candidates[0].weakness.cvss).toBeUndefined();
      expect(log.warn).toHaveBeenCalled();
      expect(JSON.stringify(log.warn.mock.calls)).not.toContain("SECRET");
    },
  );

  it("recovers malformed CVSS vendor records without losing valid vendors or exposing arbitrary keys", async () => {
    for (const bad of [null, "SECRET-vendor", 42, true, []]) {
      const CVSS = {
        "SECRET-vendor-key": bad,
        survivor: { V3Score: 7 },
        "SECRET-unknown": { "SECRET-slot": "SECRET-value" },
      };
      const { candidates, log } = await normalize(
        report([result({ Vulnerabilities: [detection({ CVSS })] })]),
      );
      expect(candidates).toHaveLength(1);
      expect(candidates[0].weakness.cvss).toEqual([{ score: 7 }]);
      expect(provenance(candidates[0]).result.CVSS).toEqual(CVSS);
      expect(log.warn).toHaveBeenCalled();
      expect(JSON.stringify(log.warn.mock.calls)).not.toContain("SECRET");
    }
  });

  it("shares report identity/time policies and isolates mutable metadata, dates, and identifiers", async () => {
    const unknown = { values: ["source"] };
    const CVSS = { vendor: { V3Score: 7 } };
    const item = detection({
      InstalledVersion: "1.0",
      Layer: { Digest: "layer" },
      PkgIdentifier: { UID: "uid" },
      CVSS,
      PublishedDate: "2000-01-01T00:00:00Z",
      unknown,
    });
    const scanResult = { Target: "manifest", Class: "lang-pkgs", Type: "future", unknown };
    const Metadata = {
      Reference: "registry.example.com:5000/team/app:latest",
      RepoTags: ["REGISTRY.example.com:5000/team/app:v1"],
      RepoDigests: [`registry.example.com:5000/team/app@sha256:${"a".repeat(64)}`],
      RepoURL: "git@GitHub.com:Org/Repo.git",
      Commit: "revision",
      unknown,
    };
    const document = {
      SchemaVersion: 2,
      ArtifactName: "/tmp/image.tar",
      ArtifactType: "container_image",
      CreatedAt: "2024-02-29T23:30:12.123456789+05:30",
      Metadata,
      unknown,
    };
    const raw = report(
      [
        {
          ...scanResult,
          Vulnerabilities: [item, item],
          Misconfigurations: [],
          Packages: [unknown],
          Secrets: [],
          Licenses: [],
          CustomResources: [],
          ExperimentalModifiedFindings: [],
          CryptoAssets: [],
        },
        { ...scanResult, Vulnerabilities: [item] },
      ],
      document,
    );
    const input = bytes(raw);
    const original = input.slice();
    const { candidates, log } = await run(input);
    expect(candidates).toHaveLength(3);
    for (const candidate of candidates) {
      expect(candidate.assetIdentifierCandidates).toEqual(
        expect.arrayContaining([
          { type: "ociImageName", namespace: null, value: "registry.example.com:5000/team/app" },
          { type: "vcsRepository", namespace: null, value: "github.com/Org/Repo" },
        ]),
      );
      expect(candidate.assetIdentifierCandidates).toHaveLength(2);
      expect(candidate.observedAt?.toISOString()).toBe("2024-02-29T18:00:12.123Z");
      expect(candidate.sourceMetadata).toEqual({
        provenance: { document, scanResult, result: item },
      });
    }
    const expected = structuredClone(candidates);
    for (const scope of ["document", "scanResult", "result"] as const) {
      (provenance(candidates[0])[scope].unknown as typeof unknown).values.push("changed");
    }
    const rawCvss = provenance(candidates[0]).result.CVSS as typeof CVSS;
    rawCvss.vendor.V3Score = 0;
    candidates[0].observedAt?.setTime(0);
    candidates[0].assetIdentifierCandidates[0].value = "changed";
    expect(candidates.slice(1)).toEqual(expected.slice(1));
    expect((await run(input)).candidates).toEqual(expected);
    expect(unknown.values).toEqual(["source"]);
    expect(CVSS.vendor.V3Score).toBe(7);
    expect(input).toEqual(original);
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("recovers optional identity and report dates without substituting artifact, PURL, or advisory context", async () => {
    for (const CreatedAt of [undefined, null, "SECRET-time", "2026-02-30T00:00:00Z"]) {
      const { candidates, log } = await normalize(
        report(
          [
            result({
              Vulnerabilities: [
                detection({
                  PkgIdentifier: { PURL: "pkg:golang/github.com/Org/Repo@1.0" },
                  PublishedDate: "2026-01-01T00:00:00Z",
                  LastModifiedDate: "2026-01-02T00:00:00Z",
                }),
              ],
            }),
          ],
          {
            CreatedAt,
            ArtifactType: "repository",
            ArtifactName: "https://github.com/Org/Repo",
            Metadata: {
              RepoURL: "https://user:SECRET-password@github.com/Org/Repo",
              RepoTags: ["nginx:latest", "SECRET-invalid/image:"],
              ImageID: `sha256:${"b".repeat(64)}`,
            },
          },
        ),
      );
      expect(candidates).toHaveLength(1);
      expect(candidates[0].observedAt).toBeNull();
      expect(candidates[0].assetIdentifierCandidates).toEqual([
        { type: "ociImageName", namespace: null, value: "nginx" },
      ]);
      expect(log.warn).toHaveBeenCalled();
      expect(JSON.stringify(log.warn.mock.calls)).not.toContain("SECRET");
    }
  });

  it("logs only known structural fields and numeric locators, never raw keys, paths, IDs, or parser messages", async () => {
    const bad = { "SECRET-arbitrary-key": ["SECRET-value"] };
    const item = detection({
      VulnerabilityID: "SECRET-native-id",
      PkgName: "SECRET-package",
      Title: bad,
      Description: bad,
      Severity: "SECRET-severity",
      InstalledVersion: bad,
      PkgPath: bad,
      Status: bad,
      FixedVersion: bad,
      PkgIdentifier: { PURL: "pkg:npm/%SECRET" },
      VendorIDs: [bad, "CVE-SECRET-alias"],
      CweIDs: ["SECRET-cwe"],
      PrimaryURL: bad,
      References: [bad],
      CVSS: {
        "SECRET-vendor": {
          V2Score: bad,
          V2Vector: bad,
          V3Score: bad,
          V3Vector: bad,
          V40Score: bad,
          V40Vector: bad,
        },
        "SECRET-vendor-2": bad,
      },
    });
    const { candidates, log } = await normalize(
      report([result({ Target: "SECRET-path", Type: "SECRET-type", Vulnerabilities: [item] })], {
        CreatedAt: "SECRET-time",
        Metadata: { RepoURL: bad },
      }),
    );
    expect(candidates).toHaveLength(1);
    expect(provenance(candidates[0]).result).toEqual(item);
    expect(log.warn).toHaveBeenCalled();
    expect(
      JSON.stringify([log.warn.mock.calls, log.info.mock.calls, log.debug.mock.calls]),
    ).not.toContain("SECRET");
    const allowed = new Set([
      "CreatedAt",
      "Metadata",
      "RepoURL",
      "Title",
      "Description",
      "Severity",
      "InstalledVersion",
      "PkgPath",
      "Status",
      "FixedVersion",
      "PkgIdentifier",
      "PURL",
      "VendorIDs",
      "CweIDs",
      "PrimaryURL",
      "References",
      "CVSS",
      "V2Score",
      "V2Vector",
      "V3Score",
      "V3Vector",
      "V40Score",
      "V40Vector",
    ]);
    for (const [fields, message] of log.warn.mock.calls) {
      expect(message).toMatch(/^trivy: /u);
      expect(
        Object.keys(fields).every((key) => ["sourceRecord", "field", "count"].includes(key)),
      ).toBe(true);
      expect(typeof fields.field).toBe("string");
      for (const part of (fields.field as string).split(/[/.]/u)) {
        expect(/^[0-9]+$/u.test(part) || allowed.has(part)).toBe(true);
      }
      if (fields.sourceRecord !== undefined)
        expect(fields.sourceRecord).toMatch(/^\/Results\/\d+(?:\/Vulnerabilities\/\d+)?$/u);
    }
  });
});
