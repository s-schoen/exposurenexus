import { readFileSync } from "node:fs";

import { observationAffectedResourceSchema } from "@exposurenexus/contracts/model/affected-resource";
import { describe, expect, it, vi } from "vitest";

import { Classifier } from "../classifier.js";
import { SemgrepJsonNormalizer } from "./semgrep.js";

import type { Logger } from "pino";

const normalizer = new SemgrepJsonNormalizer();
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const result = (overrides: Record<string, unknown> = {}) => ({
  check_id: "example.security.complete-rule-id",
  path: "src/example.ts",
  start: { line: 2, col: 3, offset: 0 },
  end: { line: 2, col: 12, offset: 9 },
  extra: { severity: "WARNING", message: "Complete message\nwith advice and a 2026-01-01 date.\n" },
  ...overrides,
});
function logger() {
  return { warn: vi.fn(), info: vi.fn(), debug: vi.fn() };
}
async function normalize(raw: unknown) {
  const log = logger();
  const candidates = await normalizer.normalize(bytes(raw), log as unknown as Logger);
  return { candidates, log };
}

describe("SemgrepJsonNormalizer fixture acceptance", () => {
  it("retains all original Juice Shop results through the classifier, including partial coverage", async () => {
    const input = readFileSync(new URL("./fixtures/semgrep.json", import.meta.url));
    const original = Buffer.from(input);
    const raw = JSON.parse(input.toString("utf8")) as typeof import("./fixtures/semgrep.json");
    const log = logger();
    const classifier = new Classifier(log as unknown as Logger);
    classifier.registerNormalizer("semgrep", normalizer);
    const candidates = await classifier.normalize("semgrep", input);

    expect(candidates).toHaveLength(68);
    expect(
      candidates.reduce<Record<string, number>>((counts, candidate) => {
        counts[candidate.severity] = (counts[candidate.severity] ?? 0) + 1;
        return counts;
      }, {}),
    ).toEqual({ high: 18, medium: 47, low: 3 });
    for (const [index, candidate] of candidates.entries()) {
      const source = raw.results[index];
      expect(candidate).toMatchObject({
        source: "semgrep",
        sourceRecord: `/results/${index}`,
        title: source.check_id,
        description: source.extra.message,
        weakness: { identifiers: { semgrep: [source.check_id] } },
        observedAt: null,
        assetIdentifierCandidates: [],
        evidence: null,
        remediation: null,
      });
      expect(candidate.affectedResource).toEqual({
        type: "sourceCode",
        file: source.path,
        location: {
          startLine: source.start.line,
          startColumn: source.start.col,
          endLine: source.end.line,
          endColumn: source.end.col,
        },
      });
      expect(observationAffectedResourceSchema.safeParse(candidate.affectedResource).success).toBe(
        true,
      );
      const metadata = source.extra.metadata;
      expect(candidate.weakness.identifiers).toEqual({
        semgrep: [source.check_id],
        cwe: metadata.cwe.map((label) => label.split(":", 1)[0]).sort(),
      });
      expect(candidate.weakness.references).toEqual([
        ...(metadata.references ?? []),
        metadata.source,
        metadata.shortlink,
        ...(metadata["source-rule-url"] === undefined ? [] : [metadata["source-rule-url"]]),
      ]);
      expect(candidate.sourceMetadata).toEqual({
        provenance: {
          result: source,
          document: { version: "1.176.1", engine_requested: "OSS" },
        },
      });
      expect(source.extra.lines).toBe("requires login");
      expect(source.extra.fingerprint).toBe("requires login");
    }
    const memberships = candidates.map((candidate) => candidate.weakness.identifiers.cwe);
    expect(memberships.flat()).toHaveLength(75);
    expect(memberships.filter((cwes) => cwes.length === 2)).toEqual(
      Array.from({ length: 7 }, () => ["CWE-1357", "CWE-353"]),
    );
    expect(memberships.filter((cwes) => cwes.length === 1)).toHaveLength(61);
    expect(candidates[0]).toMatchObject({
      title:
        "yaml.github-actions.security.github-actions-mutable-action-tag.github-actions-mutable-action-tag",
      affectedResource: {
        file: ".github/workflows/ci.yml",
        location: { startLine: 188, startColumn: 9, endLine: 188, endColumn: 44 },
      },
      weakness: {
        references: [
          "https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions#using-third-party-actions",
          "https://semgrep.dev/r/yaml.github-actions.security.github-actions-mutable-action-tag.github-actions-mutable-action-tag",
          "https://sg.run/2LgAL",
        ],
      },
    });
    expect(
      candidates.find(
        (candidate) =>
          candidate.title ===
          "generic.secrets.security.detected-generic-secret.detected-generic-secret",
      )?.weakness.references,
    ).toEqual([
      "https://owasp.org/Top10/A07_2021-Identification_and_Authentication_Failures",
      "https://semgrep.dev/r/generic.secrets.security.detected-generic-secret.detected-generic-secret",
      "https://sg.run/l2o5",
      "https://github.com/dxa4481/truffleHogRegexes/blob/master/truffleHogRegexes/regexes.json",
    ]);
    expect(raw.results.some((entry) => entry.start.line < entry.end.line)).toBe(true);
    expect(raw.results.some((entry) => entry.start.offset === 0)).toBe(true);
    const diagnosticPaths = new Set(raw.errors.map((entry) => entry.path));
    expect(raw.results.some((entry) => diagnosticPaths.has(entry.path))).toBe(true);
    expect(raw.errors).toHaveLength(61);
    expect(raw.errors.every((entry) => entry.level === "warn")).toBe(true);
    expect(log.warn).toHaveBeenCalledExactlyOnceWith(
      { field: "errors", counts: { error: 0, warn: 61, info: 0, unknown: 0 } },
      "semgrep: scanner diagnostics; coverage may be incomplete",
    );
    expect(input).toEqual(original);
  });
});

describe("SemgrepJsonNormalizer core input", () => {
  it.each(["", " \n\t", '{"SECRET":', "not-json-SECRET"])(
    "rejects invalid JSON safely (%#)",
    async (text) => {
      const log = logger();
      await expect(
        normalizer.normalize(new TextEncoder().encode(text), log as unknown as Logger),
      ).rejects.toEqual(new Error("semgrep: invalid JSON or UTF-8"));
      expect(log.warn).not.toHaveBeenCalled();
    },
  );

  it("rejects invalid UTF-8 instead of replacing it", async () => {
    const [before, after] = JSON.stringify({ results: [result({ path: "a|.js" })] }).split("|");
    const invalid = Buffer.concat([Buffer.from(before), Buffer.from([0xff]), Buffer.from(after)]);
    await expect(normalizer.normalize(invalid, logger() as unknown as Logger)).rejects.toEqual(
      new Error("semgrep: invalid JSON or UTF-8"),
    );
  });

  it.each([null, [], "SECRET", 7, true])("rejects non-object roots (%#)", async (raw) => {
    await expect(normalize(raw)).rejects.toEqual(
      new Error("semgrep: document must be a JSON object"),
    );
  });

  it.each([undefined, null, {}, "SECRET", 7, true])(
    "requires a results array (%#)",
    async (results) => {
      await expect(normalize({ results })).rejects.toEqual(
        new Error("semgrep: /results must be an array"),
      );
    },
  );

  it.each([null, [], "SECRET", 7, true])(
    "rejects non-object results atomically (%#)",
    async (invalid) => {
      await expect(normalize({ results: [result(), invalid] })).rejects.toEqual(
        new Error("semgrep: /results/1 must be an object"),
      );
    },
  );

  it.each(["check_id", "path", "extra"])(
    "rejects malformed %s after a valid result",
    async (field) => {
      const invalidValues =
        field === "extra"
          ? [undefined, null, [], "SECRET", 7, true]
          : [undefined, null, [], {}, "", " \n\t", 7, true];
      for (const value of invalidValues) {
        await expect(
          normalize({ results: [result(), result({ [field]: value })] }),
        ).rejects.toEqual(
          new Error(
            `semgrep: /results/1/${field} must be ${field === "extra" ? "an object" : "a nonblank string"}`,
          ),
        );
      }
    },
  );

  it.each([undefined, "future", "0.1", null, 42, { unknown: ["value"] }])(
    "accepts version-independent minimal reports and preserves supplied context (%#)",
    async (version) => {
      const document =
        version === undefined ? {} : { version, engine_requested: { arbitrary: true } };
      const raw = result({ unknown: { nested: [null, "value"] } });
      const { candidates } = await normalize({ ...document, results: [raw] });
      expect(candidates).toHaveLength(1);
      expect(candidates[0].sourceMetadata).toEqual({ provenance: { result: raw, document } });
    },
  );

  it("gives each candidate its own copy of the report provenance", async () => {
    const document = { version: "1.0.0", engine_requested: { name: "OSS" } };
    const { candidates } = await normalize({ ...document, results: [result(), result()] });
    const [first, second] = candidates.map(
      ({ sourceMetadata }) => (sourceMetadata.provenance as { document: unknown }).document,
    );
    expect(first).toEqual(document);
    expect(second).toEqual(first);
    expect(second).not.toBe(first);
  });

  it("accepts an empty results array without other report fields", async () => {
    const { candidates, log } = await normalize({ results: [] });
    expect(candidates).toEqual([]);
    expect(log.warn).not.toHaveBeenCalled();
  });
});

describe("SemgrepJsonNormalizer candidate mapping", () => {
  it("preserves complete title, path and description text while the classifier canonicalizes rule identity", async () => {
    const raw = result({ check_id: " Custom.Complete.Rule ", path: " ../src/../example.ts " });
    const log = logger();
    const classifier = new Classifier(log as unknown as Logger);
    classifier.registerNormalizer("semgrep", normalizer);
    const [direct] = (await normalize({ results: [raw] })).candidates;
    expect(direct.weakness.identifiers.semgrep).toEqual([raw.check_id]);
    const [canonical] = await classifier.normalize(
      "semgrep",
      bytes({ results: [raw], time: { total: 123 } }),
    );
    expect(canonical).toMatchObject({
      title: raw.check_id,
      description: raw.extra.message,
      affectedResource: { type: "sourceCode", file: raw.path },
      weakness: { identifiers: { semgrep: ["Custom.Complete.Rule"] } },
      observedAt: null,
      assetIdentifierCandidates: [],
    });
    expect(canonical.sourceMetadata).toEqual({ provenance: { result: raw, document: {} } });
  });

  it.each([
    ["INFO", "low"],
    ["LOW", "low"],
    ["WARNING", "medium"],
    ["MEDIUM", "medium"],
    ["ERROR", "high"],
    ["HIGH", "high"],
    ["CRITICAL", "critical"],
    ["EXPERIMENT", "info"],
    ["INVENTORY", "info"],
  ])("maps severity %s to %s without other metadata overriding it", async (severity, expected) => {
    const { candidates, log } = await normalize({
      results: [
        result({
          extra: {
            severity,
            is_ignored: true,
            validation_state: "CONFIRMED_VALID",
            metadata: { confidence: "HIGH", impact: "CRITICAL", likelihood: "HIGH" },
          },
        }),
      ],
    });
    expect(candidates[0].severity).toBe(expected);
    expect(log.warn).not.toHaveBeenCalled();
  });

  it.each([undefined, null, "SECRET", "", 7, true, {}, [], "__proto__", "constructor"])(
    "falls back from missing or unusable severity with a safe warning (%#)",
    async (severity) => {
      const raw = result({ extra: { severity } });
      const { candidates, log } = await normalize({ results: [raw] });
      expect(candidates[0].severity).toBe("info");
      expect(log.warn).toHaveBeenCalledExactlyOnceWith(
        { sourceRecord: "/results/0", field: "extra.severity" },
        "semgrep: ignoring unusable optional value",
      );
    },
  );

  it.each([undefined, null, "", " \n\t", 7, true, {}, []])(
    "uses null for unusable descriptions (%#)",
    async (message) => {
      const { candidates, log } = await normalize({
        results: [result({ extra: { severity: "HIGH", message } })],
      });
      expect(candidates[0].description).toBeNull();
      // Blank messages are unavailable rather than malformed.
      if (message === undefined || typeof message === "string") {
        expect(log.warn).not.toHaveBeenCalled();
      } else {
        expect(log.warn).toHaveBeenCalledExactlyOnceWith(
          { sourceRecord: "/results/0", field: "extra.message" },
          expect.any(String),
        );
      }
    },
  );

  it("retains duplicates, suppressed, audit, IaC, CI, secret and dependency results in order", async () => {
    const records = [
      result(),
      result(),
      result({ path: "terraform/main.tf", extra: { severity: "HIGH", is_ignored: true } }),
      result({
        path: ".github/workflows/ci.yml",
        extra: { severity: "LOW", metadata: { category: "audit" } },
      }),
      result({ path: "config.yaml", check_id: "hardcoded-secret" }),
      result({
        path: "package-lock.json",
        extra: {
          severity: "MEDIUM",
          sca_info: { dependency: { name: "example", version: "1.0" } },
        },
      }),
    ];
    const { candidates } = await normalize({ results: records });
    expect(candidates).toHaveLength(records.length);
    for (const [index, candidate] of candidates.entries()) {
      expect(candidate.sourceRecord).toBe(`/results/${index}`);
      expect(candidate.affectedResource).toMatchObject({
        type: "sourceCode",
        file: records[index].path,
      });
      expect(candidate.sourceMetadata).toEqual({
        provenance: { result: records[index], document: {} },
      });
      expect(candidate).not.toHaveProperty("status");
    }
  });

  it("preserves all raw values without copying unrelated document collections", async () => {
    const raw = result({
      start: { line: 3, col: "SECRET", offset: -1 },
      extra: {
        message: { SECRET: "message" },
        severity: "UNKNOWN",
        lines: "requires login",
        fingerprint: "requires login",
        metadata: { unknown: [1, false] },
        is_ignored: true,
      },
      unknown: { nested: [1, null, true] },
    });
    const report = {
      version: null,
      engine_requested: ["future"],
      results: [raw, result({ check_id: "SIBLING" })],
      errors: [{ level: "warn", message: "DIAGNOSTIC" }],
      paths: { scanned: ["INVENTORY"] },
      skipped_rules: ["SKIPPED"],
      time: { profiling: "PROFILING" },
    };
    const input = bytes(report);
    const snapshot = input.slice();
    const candidates = await normalizer.normalize(input, logger() as unknown as Logger);
    expect(candidates[0].sourceMetadata).toEqual({
      provenance: {
        result: raw,
        document: { version: null, engine_requested: ["future"] },
      },
    });
    expect(input).toEqual(snapshot);
  });
});

describe("SemgrepJsonNormalizer weakness enrichment", () => {
  it.each([
    ["CWE-798: Use of Hard-coded Credentials", ["CWE-798"]],
    [" cwe-798 : Description mentioning CWE-89 ", ["CWE-798"]],
    ["CWE-89", ["CWE-89"]],
    [" cwe-89 ", ["CWE-89"]],
    [" 89 ", ["CWE-89"]],
    [
      ["CWE-353", "1357", "CWE-1357: Label", "cwe-353", "798"],
      ["CWE-353", "CWE-1357", "CWE-798"],
    ],
    [["CWE-079: Label", "CWE-79", "079"], ["CWE-79"]],
  ])(
    "canonicalizes scalar/list classifications without changing originals (%#)",
    async (cwe, expected) => {
      const raw = result({ extra: { severity: "WARNING", metadata: { cwe } } });
      const { candidates, log } = await normalize({ results: [raw] });
      expect(candidates).toHaveLength(1);
      expect(candidates[0].weakness).toEqual({
        identifiers: { semgrep: [raw.check_id], cwe: expected },
      });
      expect(candidates[0].sourceMetadata).toEqual({ provenance: { result: raw, document: {} } });
      expect(log.warn).not.toHaveBeenCalled();
    },
  );

  it.each([undefined, {}, { cwe: [], references: [] }])(
    "keeps scanner identity when classifications are absent (%#)",
    async (metadata) => {
      const { candidates, log } = await normalize({
        results: [result({ extra: { severity: "WARNING", metadata } })],
      });
      expect(candidates[0].weakness).toEqual({
        identifiers: { semgrep: ["example.security.complete-rule-id"] },
      });
      expect(log.warn).not.toHaveBeenCalled();
    },
  );

  it.each([null, [], "SECRET metadata", 42, true])(
    "recovers from malformed metadata through the classifier (%#)",
    async (metadata) => {
      const raw = result({ extra: { severity: "WARNING", metadata } });
      const log = logger();
      const classifier = new Classifier(log as unknown as Logger);
      classifier.registerNormalizer("semgrep", normalizer);
      const candidates = await classifier.normalize("semgrep", bytes({ results: [raw] }));
      expect(candidates).toHaveLength(1);
      expect(candidates[0].weakness).toEqual({ identifiers: { semgrep: [raw.check_id] } });
      expect(candidates[0].sourceMetadata).toEqual({ provenance: { result: raw, document: {} } });
      expect(log.warn).toHaveBeenCalledExactlyOnceWith(
        { sourceRecord: "/results/0", field: "extra.metadata" },
        "semgrep: ignoring unusable optional value",
      );
    },
  );

  it.each(["cwe", "references", "source", "shortlink", "source-rule-url"])(
    "keeps valid neighbors and candidates despite malformed %s values",
    async (field) => {
      const invalid = [
        null,
        42,
        true,
        { SECRET: "value" },
        [[{ SECRET: "nested" }]],
        "",
        " \n\t",
        ...(field === "cwe"
          ? [
              "SECRET CWE-89: prose",
              "https://SECRET/CWE-89",
              "CWE-89SECRET: label",
              "CWE--89",
              "89: SECRET",
              "CWE-0: SECRET label",
              "CWE-000",
            ]
          : []),
      ];
      const valid = field === "cwe" ? "CWE-798: SECRET label" : " https://SECRET/Reference ";
      const records = [
        result(),
        result({
          extra: { severity: "WARNING", metadata: { [field]: [valid, ...invalid, valid] } },
        }),
        ...invalid.map((value) =>
          result({ extra: { severity: "WARNING", metadata: { [field]: value } } }),
        ),
      ];
      const log = logger();
      const classifier = new Classifier(log as unknown as Logger);
      classifier.registerNormalizer("semgrep", normalizer);
      const candidates = await classifier.normalize("semgrep", bytes({ results: records }));
      expect(candidates).toHaveLength(records.length);
      expect(candidates[1].weakness).toEqual({
        identifiers: {
          semgrep: [records[1].check_id],
          ...(field === "cwe" ? { cwe: ["CWE-798"] } : {}),
        },
        ...(field === "cwe" ? {} : { references: [valid] }),
      });
      for (const [index, candidate] of candidates.entries()) {
        expect(candidate.sourceRecord).toBe(`/results/${index}`);
        expect(candidate.sourceMetadata).toEqual({
          provenance: { result: records[index], document: {} },
        });
        if (index >= 2) {
          expect(candidate.weakness).toEqual({
            identifiers: { semgrep: [records[index].check_id] },
          });
        }
      }
      expect(log.warn.mock.calls.map(([context]) => context)).toEqual([
        ...invalid.map(() => ({ sourceRecord: "/results/1", field: `extra.metadata.${field}` })),
        ...invalid.map((_, index) => ({
          sourceRecord: `/results/${index + 2}`,
          field: `extra.metadata.${field}`,
        })),
      ]);
      expect(JSON.stringify(log.warn.mock.calls)).not.toContain("SECRET");
    },
  );

  it.each([false, true])(
    "collects all reference sources without inventing classifications or subject identity (scalar=%s)",
    async (scalar) => {
      const raw = result({
        extra: {
          severity: "INFO",
          message: "Example CWE-89, CVE-2026-1234 and advice.",
          metadata: {
            references: scalar
              ? " https://Example.test/CWE-89 "
              : [
                  " https://Example.test/CWE-89 ",
                  "https://example.test/CWE-89",
                  " https://Example.test/CWE-89 ",
                ],
            source: ["https://example.test/CWE-89", "https://Rules.test/CVE-2026-1234"],
            shortlink: "https://sg.run/Example",
            "source-rule-url": ["https://Rules.test/CVE-2026-1234", " Rule documentation "],
            owasp: ["QUESTIONABLE", null],
            technology: { SECRET: true },
            confidence: "CRITICAL",
            impact: ["HIGH"],
            likelihood: 42,
            unknown: { cwe: "CWE-353" },
          },
        },
      });
      const log = logger();
      const classifier = new Classifier(log as unknown as Logger);
      classifier.registerNormalizer("semgrep", normalizer);
      const candidates = await classifier.normalize("semgrep", bytes({ results: [raw, raw] }));
      expect(candidates).toHaveLength(2);
      for (const candidate of candidates) {
        expect(candidate.weakness).toEqual({
          identifiers: { semgrep: [raw.check_id] },
          references: [
            " https://Example.test/CWE-89 ",
            "https://example.test/CWE-89",
            "https://Rules.test/CVE-2026-1234",
            "https://sg.run/Example",
            " Rule documentation ",
          ],
        });
        expect(candidate.severity).toBe("low");
        expect(candidate.description).toBe(raw.extra.message);
        expect(candidate.affectedResource).not.toHaveProperty("repository");
        expect(candidate.affectedResource).not.toHaveProperty("revision");
        expect(candidate.assetIdentifierCandidates).toEqual([]);
        expect(candidate.sourceMetadata).toEqual({ provenance: { result: raw, document: {} } });
      }
      expect(log.warn).not.toHaveBeenCalled();
    },
  );
});

describe("SemgrepJsonNormalizer evidence, fingerprints and fixes", () => {
  it("preserves richer code and provenance through the classifier without deduplicating fingerprints", async () => {
    const lines =
      "\n\tconst example = `\n```markdown\n<details>source text</details>\n```\n`;\r\n  unsafe(input);  \n\n";
    const fix = "\n\treturn safe(input);  \r\n// Keep this text, including ```` fences.\n\n";
    const fingerprint = " Opaque.Source.Fingerprint/v2:ABC ";
    const extra = {
      ...result().extra,
      lines,
      fingerprint,
      fix,
      metavars: { $INPUT: { abstract_content: "input", start: { offset: 0 } } },
      dataflow_trace: { intermediate_vars: [{ content: "unsafe(input)" }] },
      unknown: [null, { original: true }],
    };
    const records = [
      result({ extra }),
      result({ path: "src/other.ts", start: undefined, end: undefined, extra }),
    ];
    const input = bytes({ results: records });
    const snapshot = input.slice();
    const log = logger();
    const classifier = new Classifier(log as unknown as Logger);
    classifier.registerNormalizer("semgrep", normalizer);
    const candidates = await classifier.normalize("semgrep", input);

    expect(candidates).toHaveLength(2);
    for (const [index, candidate] of candidates.entries()) {
      expect(candidate).toMatchObject({
        source: "semgrep",
        sourceRecord: `/results/${index}`,
        description: extra.message,
        weakness: { identifiers: { semgrep: [records[index].check_id] } },
        affectedResource: {
          type: "sourceCode",
          file: records[index].path,
          locationFingerprint: fingerprint,
        },
      });
      expect(candidate.evidence).toBe(
        `<details><summary>Code Snippet</summary>\n\n\`\`\`\`\n${lines}\n\`\`\`\`\n\n</details>`,
      );
      expect(candidate.remediation).toBe(
        `Suggested fix: replace the matched source range with:\n\n\`\`\`\`\`\n${fix}\n\`\`\`\`\``,
      );
      expect(observationAffectedResourceSchema.safeParse(candidate.affectedResource).success).toBe(
        true,
      );
      // Location identity keeps the source text; observation fingerprints are canonicalized.
      expect(candidate.fingerprints).toEqual({ semgrep: [fingerprint.trim()] });
      expect(candidate.sourceMetadata).toEqual({
        provenance: { result: records[index], document: {} },
      });
    }
    expect(candidates[1].affectedResource).not.toHaveProperty("location");
    expect(log.warn).not.toHaveBeenCalled();
    expect(input).toEqual(snapshot);
  });

  it.each(["  safe(input);  \n\treturn value;\n", " \t\r\n", ""])(
    "renders complete replacement text or an explicit deletion suggestion (%#)",
    async (fix) => {
      const raw = result({ extra: { ...result().extra, fix } });
      const { candidates, log } = await normalize({ results: [raw] });
      expect(candidates[0].remediation).toBe(
        fix === ""
          ? "Suggested fix: delete the matched source range."
          : `Suggested fix: replace the matched source range with:\n\n\`\`\`\n${fix}\n\`\`\``,
      );
      expect(candidates[0].description).toBe(result().extra.message);
      expect(candidates[0].evidence).toBeNull();
      expect(candidates[0].sourceMetadata).toEqual({ provenance: { result: raw, document: {} } });
      expect(log.warn).not.toHaveBeenCalled();
    },
  );

  it.each([undefined, "requires login"])(
    "leaves missing and login-gated evidence and fingerprints absent without warnings (%#)",
    async (value) => {
      const raw = result({
        extra: { ...result().extra, lines: value, fingerprint: value },
      });
      const { candidates, log } = await normalize({ results: [raw] });
      expect(candidates[0].evidence).toBeNull();
      expect(candidates[0].remediation).toBeNull();
      expect(candidates[0].affectedResource).not.toHaveProperty("locationFingerprint");
      expect(candidates[0].fingerprints).toEqual({});
      expect(candidates[0].description).toBe(result().extra.message);
      expect(candidates[0].sourceMetadata).toEqual({ provenance: { result: raw, document: {} } });
      expect(log.warn).not.toHaveBeenCalled();
    },
  );

  it.each(["lines", "fingerprint", "fix"])(
    "recovers from malformed %s without losing usable neighbors or leaking source values",
    async (field) => {
      const extra = {
        ...result().extra,
        lines: "SECRET snippet\n",
        fingerprint: "SECRET opaque fingerprint",
        fix: "SECRET replacement\n",
        metavars: { SECRET: [null, 42] },
        dataflow_trace: ["SECRET dataflow", { malformed: true }],
      };
      const invalid = [
        null,
        42,
        true,
        [],
        ["SECRET value"],
        { SECRET: "value" },
        ...(field === "fix" ? [] : ["", " \n\t"]),
      ];
      const records = [
        result(),
        ...invalid.map((value) => result({ extra: { ...extra, [field]: value } })),
      ];
      const { candidates, log } = await normalize({ results: records });
      expect(candidates).toHaveLength(records.length);
      for (const [index, candidate] of candidates.entries()) {
        expect(candidate.sourceRecord).toBe(`/results/${index}`);
        expect(candidate.sourceMetadata).toEqual({
          provenance: { result: records[index], document: {} },
        });
        if (index === 0) {
          continue;
        }
        expect(candidate.description).toBe(extra.message);
        expect(candidate.evidence).toBe(
          field === "lines"
            ? null
            : `<details><summary>Code Snippet</summary>\n\n\`\`\`\n${extra.lines}\n\`\`\`\n\n</details>`,
        );
        expect(candidate.remediation).toBe(
          field === "fix"
            ? null
            : `Suggested fix: replace the matched source range with:\n\n\`\`\`\n${extra.fix}\n\`\`\``,
        );
        if (field === "fingerprint") {
          expect(candidate.affectedResource).not.toHaveProperty("locationFingerprint");
          expect(candidate.fingerprints).toEqual({});
        } else {
          expect(candidate.affectedResource).toMatchObject({
            locationFingerprint: extra.fingerprint,
          });
          expect(candidate.fingerprints).toEqual({ semgrep: [extra.fingerprint] });
        }
      }
      expect(log.warn.mock.calls).toEqual(
        invalid.map((_, index) => [
          { sourceRecord: `/results/${index + 1}`, field: `extra.${field}` },
          "semgrep: ignoring unusable optional value",
        ]),
      );
      expect(JSON.stringify(log.warn.mock.calls)).not.toContain("SECRET");
    },
  );
});

describe("SemgrepJsonNormalizer locations", () => {
  it.each([
    [
      { line: 1, col: 1, offset: 0 },
      { line: 1, col: 10, offset: 9 },
      { startLine: 1, startColumn: 1, endLine: 1, endColumn: 10 },
    ],
    [
      { line: 2, col: 8 },
      { line: 4, col: 1 },
      { startLine: 2, startColumn: 8, endLine: 4, endColumn: 1 },
    ],
    [{ line: 2, offset: -1 }, undefined, { startLine: 2 }],
    [{ line: 2, col: 3 }, { col: 8 }, { startLine: 2, startColumn: 3, endColumn: 8 }],
    [
      { line: 2, col: 3 },
      { line: 2, col: 3 },
      { startLine: 2, startColumn: 3, endLine: 2, endColumn: 3 },
    ],
    [undefined, undefined, undefined],
    [{ col: 3 }, { line: 4, col: 8 }, undefined],
  ])(
    "keeps one-based, exclusive-end and partial coordinates (%#)",
    async (start, end, location) => {
      const { candidates, log } = await normalize({ results: [result({ start, end })] });
      expect(candidates[0].affectedResource).toEqual({
        type: "sourceCode",
        file: "src/example.ts",
        ...(location === undefined ? {} : { location }),
      });
      expect(log.warn).not.toHaveBeenCalled();
    },
  );

  it.each([null, [], "SECRET", true, 42])(
    "recovers from non-object positions (%#)",
    async (value) => {
      const { candidates, log } = await normalize({
        results: [result({ start: value, end: value })],
      });
      expect(candidates[0].affectedResource).not.toHaveProperty("location");
      expect(log.warn.mock.calls.map(([context]) => context.field)).toEqual(["start", "end"]);
    },
  );

  it.each([null, "SECRET", 0, -1, 1.5, true, [], {}])(
    "omits only unusable coordinate components (%#)",
    async (value) => {
      const { candidates, log } = await normalize({
        results: [
          result({ start: { line: value, col: 3 } }),
          result({ start: { line: 2, col: value }, end: { line: 4, col: value } }),
          result({ end: { line: value, col: 8 } }),
        ],
      });
      expect(candidates[0].affectedResource).not.toHaveProperty("location");
      expect(candidates[1].affectedResource).toMatchObject({
        location: { startLine: 2, endLine: 4 },
      });
      expect(candidates[1].affectedResource).not.toHaveProperty("location.startColumn");
      expect(candidates[1].affectedResource).not.toHaveProperty("location.endColumn");
      // The end column belongs to the unusable end line, not to the start line.
      expect(candidates[2].affectedResource).toEqual({
        type: "sourceCode",
        file: "src/example.ts",
        location: { startLine: 2, startColumn: 3 },
      });
      expect(log.warn.mock.calls.map(([context]) => context)).toEqual([
        { sourceRecord: "/results/0", field: "start.line" },
        { sourceRecord: "/results/1", field: "start.col" },
        { sourceRecord: "/results/1", field: "end.col" },
        { sourceRecord: "/results/2", field: "end.line" },
      ]);
    },
  );

  it.each([
    [{ line: 1, col: 99 }, "end.line", {}],
    [{ line: 2, col: 2 }, "end.col", { endLine: 2 }],
    [{ col: 2 }, "end.col", {}],
  ])(
    "retains the start rather than publishing a reversed range (%#)",
    async (end, field, validEnd) => {
      const raw = result({ end });
      const { candidates, log } = await normalize({ results: [raw] });
      expect(candidates[0].affectedResource).toEqual({
        type: "sourceCode",
        file: raw.path,
        location: { startLine: 2, startColumn: 3, ...validEnd },
      });
      expect(log.warn).toHaveBeenCalledExactlyOnceWith(
        { sourceRecord: "/results/0", field },
        expect.any(String),
      );
      expect(candidates[0].sourceMetadata).toEqual({ provenance: { result: raw, document: {} } });
    },
  );
});

describe("SemgrepJsonNormalizer diagnostics", () => {
  it.each([false, true])(
    "counts mixed levels without dropping results or logging source content (empty=%s)",
    async (empty) => {
      const diagnostic = {
        message: "SECRET diagnostic",
        path: "SECRET.ts",
        spans: ["SECRET code"],
        type: { SECRET: [1] },
      };
      const { candidates, log } = await normalize({
        results: empty ? [] : [result({ path: diagnostic.path })],
        errors: [
          { ...diagnostic, level: "error" },
          { ...diagnostic, level: "warn" },
          { ...diagnostic, level: "warn" },
          { ...diagnostic, level: "info" },
          { ...diagnostic, level: "SECRET" },
          { ...diagnostic, level: [] },
          {},
          null,
          [],
          "SECRET",
        ],
      });
      expect(candidates).toHaveLength(empty ? 0 : 1);
      expect(log.warn).toHaveBeenCalledExactlyOnceWith(
        { field: "errors", counts: { error: 1, warn: 2, info: 1, unknown: 6 } },
        "semgrep: scanner diagnostics; coverage may be incomplete",
      );
      expect(JSON.stringify(log.warn.mock.calls)).not.toContain("SECRET");
    },
  );

  it.each([null, {}, "SECRET", 7, true])(
    "recovers from malformed diagnostic collections (%#)",
    async (errors) => {
      const { candidates, log } = await normalize({ results: [result()], errors });
      expect(candidates).toHaveLength(1);
      expect(log.warn).toHaveBeenCalledExactlyOnceWith(
        { field: "errors" },
        "semgrep: ignoring unusable optional value",
      );
    },
  );

  it.each(["error", "warn"])(
    "keeps %s coverage diagnostics visible for empty reports",
    async (level) => {
      const { candidates, log } = await normalize({ results: [], errors: [{ level }] });
      expect(candidates).toEqual([]);
      expect(log.warn).toHaveBeenCalledExactlyOnceWith(
        { field: "errors", counts: { error: 0, warn: 0, info: 0, unknown: 0, [level]: 1 } },
        expect.any(String),
      );
    },
  );

  it("summarizes info-only diagnostics without warning and ignores empty diagnostics", async () => {
    const { candidates, log } = await normalize({
      results: [result()],
      errors: [{ level: "info", message: "SECRET" }],
    });
    expect(candidates).toHaveLength(1);
    expect(log.warn).not.toHaveBeenCalled();
    expect(log.info).toHaveBeenCalledExactlyOnceWith(
      { field: "errors", counts: { error: 0, warn: 0, info: 1, unknown: 0 } },
      "semgrep: scanner diagnostics",
    );
    const empty = await normalize({ results: [], errors: [] });
    expect(empty.log.warn).not.toHaveBeenCalled();
    expect(empty.log.info).not.toHaveBeenCalled();
  });

  it("logs only structural labels for malformed optional values", async () => {
    const { candidates, log } = await normalize({
      results: [
        result({
          check_id: "SECRET rule",
          path: "SECRET path",
          start: { line: "SECRET line", col: "SECRET col" },
          end: "SECRET span",
          extra: {
            severity: "SECRET severity",
            message: { SECRET: "message" },
            lines: "SECRET snippet",
          },
        }),
      ],
    });
    expect(candidates).toHaveLength(1);
    expect(log.warn).toHaveBeenCalledTimes(5);
    expect(JSON.stringify(log.warn.mock.calls)).not.toContain("SECRET");
  });
});
