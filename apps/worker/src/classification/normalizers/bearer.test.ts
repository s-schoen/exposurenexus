import { readFileSync } from "node:fs";

import { observationAffectedResourceSchema } from "@exposurenexus/contracts/model/affected-resource";
import { describe, expect, it, vi } from "vitest";

import { Classifier } from "../classifier.js";
import { BearerJsonNormalizer } from "./bearer.js";
import { renderEvidenceSection } from "./shared.js";

import type { Logger } from "pino";

const normalizer = new BearerJsonNormalizer();
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const finding = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: "custom.security.rule",
  filename: "src/example.rb",
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

describe("BearerJsonNormalizer fixture acceptance", () => {
  it("retains all 400 original Juice Shop findings through the classifier in bucket order", async () => {
    const input = readFileSync(new URL("./fixtures/bearer.json", import.meta.url));
    const original = Buffer.from(input);
    const raw = JSON.parse(input.toString("utf8")) as typeof import("./fixtures/bearer.json");
    const log = logger();
    const classifier = new Classifier(log as unknown as Logger);
    classifier.registerNormalizer("bearer", normalizer);
    const candidates = await classifier.normalize("bearer", input);

    expect(candidates).toHaveLength(400);
    expect(
      candidates.reduce<Record<string, number>>((counts, candidate) => {
        counts[candidate.severity] = (counts[candidate.severity] ?? 0) + 1;
        return counts;
      }, {}),
    ).toEqual({ critical: 21, high: 22, low: 322, medium: 35 });
    expect(Object.keys(raw)).toEqual(["critical", "high", "low", "medium"]);
    const records = Object.entries(raw).flatMap(([bucket, findings]) =>
      findings.map((result, index) => ({ bucket, result, locator: `/${bucket}/${index}` })),
    );
    for (const [index, candidate] of candidates.entries()) {
      const { bucket, result, locator } = records[index];
      expect(candidate).toMatchObject({
        source: "bearer",
        sourceRecord: locator,
        title: result.title,
        severity: bucket,
        description: result.description,
        evidence: renderEvidenceSection("Code Extract", result.code_extract),
        observedAt: null,
        assetIdentifierCandidates: [],
      });
      expect(candidate.remediation).toBeTruthy();
      expect(candidate.description).toBeTruthy();
      expect(candidate.evidence).toBeTruthy();
      expect(candidate.weakness).toEqual({
        identifiers: { bearer: [result.id], cwe: result.cwe_ids.map((id) => `CWE-${id}`).sort() },
        references: [result.documentation_url],
      });
      expect(candidate.affectedResource).toEqual({
        type: "sourceCode",
        file: result.filename,
        location: {
          startLine: result.sink.start,
          startColumn: result.sink.column.start,
          endLine: result.sink.end,
          endColumn: result.sink.column.end,
        },
      });
      expect(observationAffectedResourceSchema.safeParse(candidate.affectedResource).success).toBe(
        true,
      );
      expect(candidate.sourceMetadata).toEqual({
        provenance: { result, severity: bucket, document: {} },
      });
    }
    expect(candidates.flatMap((candidate) => candidate.weakness.identifiers.cwe)).toHaveLength(400);
    expect(candidates[0]).toMatchObject({
      sourceRecord: "/critical/0",
      title: "Usage of hard-coded secret",
      affectedResource: { file: "lib/insecurity.ts" },
      weakness: {
        identifiers: { bearer: ["javascript_express_hardcoded_secret"], cwe: ["CWE-798"] },
      },
      remediation: raw.critical[0].description
        .split("## Remediations\n\n")[1]
        .split("\n\n## References")[0],
    });
    expect(candidates.at(-1)?.sourceRecord).toBe("/medium/34");
    for (const [locator, sinkLine, sourceLine] of [
      ["/medium/5", 121, 119],
      ["/medium/6", 226, 220],
    ] as const) {
      expect(candidates.find((candidate) => candidate.sourceRecord === locator)).toMatchObject({
        affectedResource: { location: { startLine: sinkLine } },
        sourceMetadata: { provenance: { result: { source: { start: sourceLine } } } },
      });
    }
    const multiline = candidates.find((candidate) => candidate.sourceRecord === "/high/12");
    expect(multiline?.affectedResource).toMatchObject({
      location: { startLine: 21, startColumn: 10, endLine: 30, endColumn: 7 },
    });
    expect(multiline?.evidence).toContain("...omitted (buffer value 3)");
    expect(log.warn).not.toHaveBeenCalled();
    expect(input.equals(original)).toBe(true);
  });
});

describe("BearerJsonNormalizer grouped envelope", () => {
  it.each(["", " \n\t", '{"SECRET":', "not-json-SECRET"])(
    "rejects invalid JSON safely (%#)",
    async (text) => {
      await expect(
        normalizer.normalize(new TextEncoder().encode(text), logger() as unknown as Logger),
      ).rejects.toEqual(new Error("bearer: invalid JSON or UTF-8"));
    },
  );

  it("rejects invalid UTF-8 even inside an otherwise usable string", async () => {
    const input = Buffer.concat([
      Buffer.from('{"high":[{"id":"rule","filename":"file","title":"'),
      Buffer.from([0xff]),
      Buffer.from('"}]}'),
    ]);
    await expect(normalizer.normalize(input, logger() as unknown as Logger)).rejects.toEqual(
      new Error("bearer: invalid JSON or UTF-8"),
    );
  });

  it.each([null, [], "SECRET", 42, true])("rejects non-object roots (%#)", async (raw) => {
    await expect(normalize(raw)).rejects.toEqual(
      new Error("bearer: document must be a JSON object"),
    );
  });

  it.each(["SECRET/path.ts", "HIGH", "errors", "findings", "version", "__proto__", "constructor"])(
    "rejects unknown buckets without exposing arbitrary keys (%#)",
    async (key) => {
      await expect(normalize({ high: [finding()], [key]: [] })).rejects.toEqual(
        new Error("bearer: document contains an unknown severity bucket"),
      );
    },
  );

  it.each([null, {}, "SECRET", 42, true])("requires bucket arrays (%#)", async (bucket) => {
    await expect(normalize({ low: [finding()], high: bucket })).rejects.toEqual(
      new Error("bearer: /high must be an array"),
    );
  });

  it.each([{}, { high: [] }, { warning: [], low: [], medium: [], critical: [], high: [] }])(
    "accepts valid empty reports (%#)",
    async (raw) => {
      const { candidates, log } = await normalize(raw);
      expect(candidates).toEqual([]);
      expect(log.warn).not.toHaveBeenCalled();
    },
  );

  it.each([null, [], "SECRET", 42, true])(
    "rejects non-object findings atomically (%#)",
    async (invalid) => {
      await expect(normalize({ high: [finding(), invalid] })).rejects.toEqual(
        new Error("bearer: /high/1 must be an object"),
      );
    },
  );

  it.each(["id", "filename"])("rejects malformed required %s atomically", async (field) => {
    for (const value of [undefined, null, [], {}, "", " \n\t", 42, true]) {
      await expect(
        normalize({ low: [finding()], high: [finding(), finding({ [field]: value })] }),
      ).rejects.toEqual(new Error(`bearer: /high/1/${field} must be a nonblank string`));
    }
  });

  it("never substitutes full_filename for missing filename", async () => {
    await expect(
      normalize({ high: [finding({ filename: undefined, full_filename: "SECRET/path.ts" })] }),
    ).rejects.toEqual(new Error("bearer: /high/0/filename must be a nonblank string"));
  });

  it("uses bucket severity and retains duplicates, source order, and occurrence fingerprints", async () => {
    const record = finding({
      severity: "critical",
      fingerprint: "repeat_0",
      old_fingerprint: "old_0",
    });
    const { candidates, log } = await normalize({
      warning: [record, record],
      low: [record],
      critical: [record],
      medium: [record],
      high: [record],
    });
    expect(candidates.map((candidate) => [candidate.sourceRecord, candidate.severity])).toEqual([
      ["/warning/0", "info"],
      ["/warning/1", "info"],
      ["/low/0", "low"],
      ["/critical/0", "critical"],
      ["/medium/0", "medium"],
      ["/high/0", "high"],
    ]);
    for (const candidate of candidates) {
      expect(candidate.affectedResource).toEqual({ type: "sourceCode", file: record.filename });
      expect(candidate.sourceMetadata).toEqual({
        provenance: {
          result: record,
          severity: candidate.sourceRecord.split("/")[1],
          document: {},
        },
      });
    }
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("accepts all-language and custom rules without inferring identity from paths or extensions", async () => {
    const findings = [
      finding({ id: "ruby_lang_eval", filename: "app/example.rb" }),
      finding({ id: "php_lang_eval", filename: "src/example.php" }),
      finding({ id: "java_lang_rule", filename: "src/Example.java" }),
      finding({ id: "python_lang_rule", filename: "src/example.py" }),
      finding({ id: "organization-custom-rule", filename: "./../example.unknown" }),
      finding({ id: " rule-with-spaces ", filename: " path-with-spaces " }),
    ];
    const { candidates } = await normalize({ high: findings });
    expect(candidates.map((candidate) => candidate.title)).toEqual(
      findings.map((entry) => entry.id),
    );
    expect(candidates.map((candidate) => candidate.affectedResource)).toEqual(
      findings.map((entry) => ({ type: "sourceCode", file: entry.filename })),
    );
  });
});

describe("BearerJsonNormalizer jsonv2 envelope", () => {
  it("retains all 400 real jsonv2 findings through the classifier with cross-format parity", async () => {
    const input = readFileSync(new URL("./fixtures/bearer-jsonv2.json", import.meta.url));
    const original = Buffer.from(input);
    const raw = JSON.parse(
      input.toString("utf8"),
    ) as typeof import("./fixtures/bearer-jsonv2.json");
    const log = logger();
    const classifier = new Classifier(log as unknown as Logger);
    classifier.registerNormalizer("bearer", normalizer);
    const candidates = await classifier.normalize("bearer", input);
    const grouped = await classifier.normalize(
      "bearer",
      bytes(
        raw.findings.reduce<Record<string, typeof raw.findings>>((buckets, result) => {
          (buckets[result.severity] ??= []).push(result);
          return buckets;
        }, {}),
      ),
    );

    expect(candidates).toHaveLength(400);
    expect(grouped).toHaveLength(400);
    expect(
      candidates.reduce<Record<string, number>>((counts, candidate) => {
        counts[candidate.severity] = (counts[candidate.severity] ?? 0) + 1;
        return counts;
      }, {}),
    ).toEqual({ critical: 21, high: 22, medium: 35, low: 322 });
    expect(candidates.map((candidate) => candidate.sourceRecord)).toEqual(
      raw.findings.map((_, index) => `/findings/${index}`),
    );
    for (const [index, candidate] of candidates.entries()) {
      const result = raw.findings[index];
      expect(candidate).toEqual({
        ...grouped[index],
        sourceRecord: candidate.sourceRecord,
        sourceMetadata: candidate.sourceMetadata,
      });
      expect(candidate.sourceMetadata).toEqual({
        provenance: {
          result,
          severity: result.severity,
          document: { source: "Bearer", version: "2.1.1" },
        },
      });
      expect(candidate).toMatchObject({
        source: "bearer",
        title: result.title,
        severity: result.severity,
        description: result.description,
        evidence: renderEvidenceSection("Code Extract", result.code_extract),
        observedAt: null,
        assetIdentifierCandidates: [],
      });
      expect(candidate.remediation).toBeTruthy();
      expect(candidate.weakness).toEqual({
        identifiers: { bearer: [result.id], cwe: result.cwe_ids.map((id) => `CWE-${id}`).sort() },
        references: [result.documentation_url],
      });
      expect(candidate.affectedResource).toEqual({
        type: "sourceCode",
        file: result.filename,
        location: {
          startLine: result.sink.start,
          startColumn: result.sink.column.start,
          endLine: result.sink.end,
          endColumn: result.sink.column.end,
        },
      });
      expect(observationAffectedResourceSchema.safeParse(candidate.affectedResource).success).toBe(
        true,
      );
    }
    expect(candidates[0]).toMatchObject({
      sourceRecord: "/findings/0",
      severity: "critical",
      title: "Usage of hard-coded secret",
      remediation: raw.findings[0].description
        .split("## Remediations\n\n")[1]
        .split("\n\n## References")[0],
      weakness: {
        identifiers: { bearer: ["javascript_express_hardcoded_secret"], cwe: ["CWE-798"] },
      },
      affectedResource: { file: "lib/insecurity.ts" },
    });
    expect(candidates.at(-1)).toMatchObject({
      sourceRecord: "/findings/399",
      severity: "low",
      affectedResource: { file: "server.ts" },
    });
    for (const [index, sinkLine, sourceLine] of [
      [48, 121, 119],
      [49, 226, 220],
    ] as const) {
      expect(candidates[index]).toMatchObject({
        affectedResource: { location: { startLine: sinkLine } },
        sourceMetadata: { provenance: { result: { source: { start: sourceLine } } } },
      });
    }
    expect(candidates[33].affectedResource).toMatchObject({
      location: { startLine: 21, startColumn: 10, endLine: 30, endColumn: 7 },
    });
    expect(candidates[33].evidence).toContain("...omitted (buffer value 3)");
    expect(raw.errors).toHaveLength(1);
    expect(log.warn).toHaveBeenCalledExactlyOnceWith(
      { field: "errors", count: 1 },
      "bearer: scanner errors; coverage may be incomplete",
    );
    expect(JSON.stringify(log.warn.mock.calls)).not.toContain(raw.errors[0].filename);
    expect(JSON.stringify(log.warn.mock.calls)).not.toContain(raw.errors[0].error);
    expect(input.equals(original)).toBe(true);
  });

  it("rejects a jsonv2 envelope without its required producer", async () => {
    await expect(normalize({ findings: [finding()] })).rejects.toEqual(
      new Error("bearer: document contains an unknown severity bucket"),
    );
  });

  it.each([null, "bearer", "SECRET", {}, [], 42, true])(
    "rejects wrong producers without exposing their values (%#)",
    async (source) => {
      await expect(normalize({ source, findings: [finding()] })).rejects.toEqual(
        new Error("bearer: /source must be Bearer"),
      );
    },
  );

  it.each([undefined, {}, "SECRET", 42, true])(
    "requires an array or null findings collection (%#)",
    async (findings) => {
      await expect(normalize({ source: "Bearer", findings })).rejects.toEqual(
        new Error("bearer: /findings must be an array or null"),
      );
    },
  );

  it.each([[], null])(
    "accepts empty reports and ignores expected detections (%#)",
    async (findings) => {
      for (const errors of [undefined, null, []]) {
        const { candidates, log } = await normalize({
          source: "Bearer",
          findings,
          errors,
          expected_findings: [finding({ severity: "critical" })],
        });
        expect(candidates).toEqual([]);
        expect(log.warn).not.toHaveBeenCalled();
      }
    },
  );

  it("does not require or validate executable version and preserves unknown metadata safely", async () => {
    for (const version of [undefined, "future-version", null, { "SECRET-version": true }]) {
      const raw = {
        source: "Bearer",
        findings: [finding({ severity: "high" })],
        ...(version === undefined ? {} : { version }),
        ["__proto__"]: { "SECRET-extension": true },
        unknown: { findings: ["nested metadata stays intact"] },
      };
      const { candidates, log } = await normalize(raw);
      const { findings: _findings, ...document } = raw;
      expect(candidates[0].sourceMetadata).toEqual({
        provenance: { result: raw.findings[0], severity: "high", document },
      });
      const provenance = candidates[0].sourceMetadata.provenance as { document: object };
      expect(Object.hasOwn(provenance.document, "__proto__")).toBe(true);
      expect(Object.getPrototypeOf(provenance.document)).toBe(Object.prototype);
      expect(log.warn).not.toHaveBeenCalled();
    }
  });

  it("maps all native severities without sorting or deduplicating findings", async () => {
    const levels = ["warning", "low", "critical", "medium", "high", "high"];
    const findings = levels.map((severity) => finding({ severity, fingerprint: "repeat_0" }));
    const { candidates, log } = await normalize({ source: "Bearer", findings });
    expect(candidates.map((candidate) => candidate.severity)).toEqual([
      "info",
      "low",
      "critical",
      "medium",
      "high",
      "high",
    ]);
    expect(candidates.map((candidate) => candidate.sourceRecord)).toEqual(
      levels.map((_, index) => `/findings/${index}`),
    );
    expect(candidates.map((candidate) => candidate.sourceMetadata)).toEqual(
      findings.map((result) => ({
        provenance: { result, severity: result.severity, document: { source: "Bearer" } },
      })),
    );
    expect(log.warn).not.toHaveBeenCalled();
  });

  it.each([undefined, null, "SECRET", "HIGH", "info", "constructor", {}, [], 42, true])(
    "recovers unusable severity while preserving its original value or absence (%#)",
    async (severity) => {
      const record = finding({ title: "Human title", severity });
      const { candidates, log } = await normalize({ source: "Bearer", findings: [record] });
      expect(candidates[0]).toMatchObject({ severity: "info", title: "Human title" });
      expect(candidates[0].sourceMetadata).toStrictEqual({
        provenance: {
          result: JSON.parse(JSON.stringify(record)),
          ...(severity === undefined ? {} : { severity }),
          document: { source: "Bearer" },
        },
      });
      expect(log.warn).toHaveBeenCalledExactlyOnceWith(
        { sourceRecord: "/findings/0", field: "severity" },
        "bearer: ignoring unusable optional value",
      );
    },
  );

  it.each([null, [], "SECRET", 42, true])(
    "rejects non-object records atomically (%#)",
    async (invalid) => {
      await expect(normalize({ source: "Bearer", findings: [finding(), invalid] })).rejects.toEqual(
        new Error("bearer: /findings/1 must be an object"),
      );
    },
  );

  it.each(["id", "filename"])(
    "rejects malformed required %s despite valid neighbors and diagnostics",
    async (field) => {
      for (const value of [undefined, null, [], {}, "", " \n\t", 42, true]) {
        const log = logger();
        await expect(
          normalizer.normalize(
            bytes({
              source: "Bearer",
              findings: [finding({ severity: "low" }), finding({ [field]: value })],
              errors: [{ message: "SECRET" }],
            }),
            log as unknown as Logger,
          ),
        ).rejects.toEqual(new Error(`bearer: /findings/1/${field} must be a nonblank string`));
        expect(log.warn).not.toHaveBeenCalled();
      }
    },
  );

  it("shares optional-field recovery with grouped JSON and keeps raw invalid values", async () => {
    const record = finding({
      severity: "low",
      title: { value: "SECRET" },
      description: ["SECRET"],
      code_extract: null,
      cwe_ids: ["79", "SECRET", " cwe-089 "],
      documentation_url: 42,
      sink: { start: "SECRET", end: 12, column: { start: 3, end: 8 } },
      source: { start: 1 },
      line_number: 5,
      unknown: ["SECRET"],
    });
    const { candidates, log } = await normalize({ source: "Bearer", findings: [record] });
    const { candidates: grouped } = await normalize({ low: [record] });
    expect(candidates).toEqual([
      {
        ...grouped[0],
        sourceRecord: "/findings/0",
        sourceMetadata: {
          provenance: { result: record, severity: "low", document: { source: "Bearer" } },
        },
      },
    ]);
    expect(candidates[0]).toMatchObject({
      affectedResource: { location: { startLine: 5 } },
      weakness: { identifiers: { cwe: ["CWE-79", "CWE-89"] } },
    });
    // A null code_extract is absent rather than unusable, so it does not warn.
    expect(log.warn).toHaveBeenCalledTimes(5);
    expect(log.warn.mock.calls.every(([fields]) => fields.sourceRecord === "/findings/0")).toBe(
      true,
    );
    expect(JSON.stringify(log.warn.mock.calls)).not.toContain("SECRET");
  });

  it("gives each candidate its own copy of the report provenance", async () => {
    const { candidates } = await normalize({
      source: "Bearer",
      version: "2.1.1",
      findings: [finding(), finding()],
    });
    const [first, second] = candidates.map(
      ({ sourceMetadata }) => (sourceMetadata.provenance as { document: unknown }).document,
    );
    expect(first).toEqual({ source: "Bearer", version: "2.1.1" });
    expect(second).toEqual(first);
    expect(second).not.toBe(first);
  });

  it("keeps grouped bucket severity authoritative while using per-record severity in jsonv2", async () => {
    const record = finding({ severity: "critical" });
    const grouped = await normalize({ warning: [record] });
    const jsonv2 = await normalize({ source: "Bearer", findings: [record] });
    expect(grouped.candidates[0].severity).toBe("info");
    expect(jsonv2.candidates[0].severity).toBe("critical");
  });
});

describe("BearerJsonNormalizer jsonv2 diagnostics", () => {
  it.each([[], null])(
    "summarizes scanner errors even with zero detections (%#)",
    async (findings) => {
      const { candidates, log } = await normalize({
        source: "Bearer",
        findings,
        errors: [{ "SECRET-key": "SECRET-message" }, "SECRET-path", null],
        expected_findings: [finding()],
      });
      expect(candidates).toEqual([]);
      expect(log.warn).toHaveBeenCalledExactlyOnceWith(
        { field: "errors", count: 3 },
        "bearer: scanner errors; coverage may be incomplete",
      );
      expect(log.info).not.toHaveBeenCalled();
      expect(log.debug).not.toHaveBeenCalled();
    },
  );

  it.each([undefined, null, []])(
    "accepts unavailable scanner errors alongside findings (%#)",
    async (errors) => {
      const { candidates, log } = await normalize({
        source: "Bearer",
        findings: [finding({ severity: "high" })],
        errors,
      });
      expect(candidates).toHaveLength(1);
      expect(log.warn).not.toHaveBeenCalled();
    },
  );

  it.each(["SECRET", { "SECRET-key": "SECRET-path" }, 42, true])(
    "recovers malformed errors without copying diagnostics or expectations into candidates (%#)",
    async (errors) => {
      const record = finding({ severity: "high" });
      const { candidates, log } = await normalize({
        source: "Bearer",
        findings: [record],
        errors,
        expected_findings: ["SECRET"],
      });
      expect(candidates).toHaveLength(1);
      expect(candidates[0].sourceMetadata).toEqual({
        provenance: { result: record, severity: "high", document: { source: "Bearer" } },
      });
      expect(log.warn).toHaveBeenCalledExactlyOnceWith(
        { field: "errors" },
        "bearer: ignoring unusable optional value",
      );
    },
  );
});

describe("BearerJsonNormalizer text and weakness", () => {
  it("maps a minimal finding without inventing optional enrichment", async () => {
    const record = finding();
    const { candidates, log } = await normalize({ low: [record] });
    expect(candidates).toEqual([
      {
        source: "bearer",
        sourceRecord: "/low/0",
        title: record.id,
        description: null,
        remediation: null,
        evidence: null,
        severity: "low",
        weakness: { identifiers: { bearer: [record.id] } },
        affectedResource: { type: "sourceCode", file: record.filename },
        assetIdentifierCandidates: [],
        observedAt: null,
        sourceMetadata: { provenance: { result: record, severity: "low", document: {} } },
      },
    ]);
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("preserves reported text, code whitespace, omission markers, and references verbatim", async () => {
    const record = finding({
      title: " Human title ",
      description:
        "## Description\n\nFull description with a 2026-01-01 date.\n\n## Remediations\n\n  Fix it.  \n\n## References\n\nKeep this too.\n",
      code_extract: "  code\n\n...omitted (buffer value 3)\n\tlast line  \n",
      documentation_url: " https://docs.example/rule ",
      category_groups: ["PII"],
      data_type: { name: "Personal Data" },
    });
    const { candidates } = await normalize({ critical: [record] });
    expect(candidates[0]).toMatchObject({
      title: record.title,
      description: record.description,
      remediation: "  Fix it.  ",
      // Code renders as Markdown in the UI, so it is fenced rather than embedded raw.
      evidence:
        "<details><summary>Code Extract</summary>\n\n```\n  code\n\n...omitted (buffer value 3)\n\tlast line  \n\n```\n\n</details>",
    });
    expect(candidates[0].weakness).toEqual({
      identifiers: { bearer: [record.id] },
      references: [record.documentation_url],
    });
  });

  it("accepts empty rule metadata and omitted extracts without warnings or evidence fallbacks", async () => {
    const { candidates, log } = await normalize({
      low: [
        finding({
          title: "",
          description: " \n\t",
          documentation_url: "",
          cwe_ids: null,
          code_extract: "",
          snippet: "not evidence",
          detailed_context: "not evidence either",
          sink: { content: "not a fallback" },
        }),
      ],
    });
    expect(candidates[0]).toMatchObject({
      title: "custom.security.rule",
      description: null,
      remediation: null,
      evidence: null,
      weakness: { identifiers: { bearer: ["custom.security.rule"] } },
    });
    expect(log.warn).not.toHaveBeenCalled();
  });

  it.each(["title", "description", "code_extract", "documentation_url"])(
    "treats a null %s as absent without a warning",
    async (field) => {
      const record = finding({
        title: "Human title",
        description: "## Remediations\n\nFix it.\n",
        code_extract: "code",
        documentation_url: "https://docs.example/rule",
        [field]: null,
      });
      const { candidates, log } = await normalize({ high: [record] });
      expect(candidates[0].title).toBe(field === "title" ? record.id : "Human title");
      expect(candidates[0].description).toBe(field === "description" ? null : record.description);
      expect(candidates[0].evidence).toBe(
        field === "code_extract" ? null : renderEvidenceSection("Code Extract", "code"),
      );
      expect(candidates[0].weakness.references).toEqual(
        field === "documentation_url" ? undefined : ["https://docs.example/rule"],
      );
      expect(log.warn).not.toHaveBeenCalled();
    },
  );

  it.each(["title", "description", "code_extract", "documentation_url"])(
    "recovers wrong-shaped %s independently with structural warnings",
    async (field) => {
      for (const value of [{}, [], 42, true]) {
        const record = finding({
          title: "Human title",
          description: "## Remediations\n\nFix it.\n",
          code_extract: "code",
          documentation_url: "https://docs.example/rule",
          [field]: value,
        });
        const { candidates, log } = await normalize({ high: [record] });
        expect(candidates).toHaveLength(1);
        expect(candidates[0].title).toBe(field === "title" ? record.id : "Human title");
        expect(candidates[0].description).toBe(field === "description" ? null : record.description);
        expect(candidates[0].remediation).toBe(field === "description" ? null : "Fix it.");
        expect(candidates[0].evidence).toBe(
          field === "code_extract" ? null : renderEvidenceSection("Code Extract", "code"),
        );
        expect(candidates[0].weakness.references).toEqual(
          field === "documentation_url" ? undefined : ["https://docs.example/rule"],
        );
        expect(log.warn).toHaveBeenCalledExactlyOnceWith(
          { sourceRecord: "/high/0", field },
          "bearer: ignoring unusable optional value",
        );
        expect(candidates[0].sourceMetadata).toEqual({
          provenance: { result: record, severity: "high", document: {} },
        });
      }
    },
  );

  it.each([undefined, null, []])("accepts unavailable CWE lists (%#)", async (cwe_ids) => {
    const { candidates, log } = await normalize({ high: [finding({ cwe_ids })] });
    expect(candidates[0].weakness).toEqual({ identifiers: { bearer: ["custom.security.rule"] } });
    expect(log.warn).not.toHaveBeenCalled();
  });

  it.each(["79", 79, {}, true])("recovers malformed CWE collections (%#)", async (cwe_ids) => {
    const { candidates, log } = await normalize({ high: [finding({ cwe_ids })] });
    expect(candidates[0].weakness.identifiers).toEqual({ bearer: ["custom.security.rule"] });
    expect(log.warn).toHaveBeenCalledExactlyOnceWith(
      { sourceRecord: "/high/0", field: "cwe_ids" },
      "bearer: ignoring unusable optional value",
    );
  });

  it("canonicalizes all valid CWEs independently without losing candidates at the classifier", async () => {
    const record = finding({
      cwe_ids: ["79", " cwe-089 ", "CWE-79", "798", "SECRET", "0", 89, null, {}, ""],
      documentation_url: "source-provided-reference",
    });
    const log = logger();
    const classifier = new Classifier(log as unknown as Logger);
    classifier.registerNormalizer("bearer", normalizer);
    const candidates = await classifier.normalize("bearer", bytes({ high: [record] }));
    expect(candidates).toHaveLength(1);
    expect(candidates[0].weakness).toEqual({
      identifiers: { bearer: [record.id], cwe: ["CWE-79", "CWE-798", "CWE-89"] },
      references: ["source-provided-reference"],
    });
    expect(log.warn).toHaveBeenCalledTimes(6);
    expect(log.warn.mock.calls.every(([fields]) => fields.field === "cwe_ids")).toBe(true);
    expect(candidates[0].sourceMetadata).toEqual({
      provenance: { result: record, severity: "high", document: {} },
    });
  });
});

describe("BearerJsonNormalizer Markdown remediation", () => {
  it.each([
    ["No section.\n", null],
    ["## Remediations\n\n## References\ntext", null],
    ["## Remediations\n \n\t\n", null],
    ["## Remediations\nFix it.", "Fix it."],
    ["## Remediations\n\nFirst.\n\n## Remediations\nSecond.", "First."],
    ["## Remediations\n\n## Remediations\nSecond.", null],
    ["## Remediations\n\nFirst.\n\n## Resources\nLink.", "First."],
    ["## Remediations\n\nFirst.\n\n# Next\nOther.", "First."],
    ["## Remediations\r\rFix it.\r\r## References\rLink.", "Fix it."],
    [
      "## Remediations\r\n\rFirst.\n\n### Nested\rMore.\r\n\n## References",
      "First.\n\n### Nested\rMore.",
    ],
    ["## Remediations\n\nFirst.\n\nReferences\n----------\nLink.", "First."],
    ["## Remediations\n\nFirst.\n\nNext\n====\nOther.", "First."],
    [
      "## Remediations\n\n- ~~~markdown\n  ## References\n  ~~~\n\nFix it.\n\n## References\nLink.",
      "- ~~~markdown\n  ## References\n  ~~~\n\nFix it.",
    ],
    [
      "## Remediations\n\n```md\n```\u00a0\n## References\n```\n\nFix it.\n\n## References\nLink.",
      "```md\n```\u00a0\n## References\n```\n\nFix it.",
    ],
    [
      "## Remediations\n\nFirst.\n\n### Nested\n  More.  \n\n## References\nLink.",
      "First.\n\n### Nested\n  More.  ",
    ],
    ["  ## Remediations ##  \n\n  Fix it.  \n\n## References", "  Fix it.  "],
    [
      "## Remediations\r\n\r\n  First.  \r\n\r\n### Nested\r\nMore.\r\n\r\n## References\r\nLink.",
      "  First.  \r\n\r\n### Nested\r\nMore.",
    ],
    [
      "```md\n## Remediations\nNot guidance.\n```\n## Remediations\n\nReal guidance.\n",
      "Real guidance.",
    ],
    [
      "## Remediations\n\n```md\n## References\n# Still code\n```\n\nFix it.\n\n## References\nLink.",
      "```md\n## References\n# Still code\n```\n\nFix it.",
    ],
    [
      "## Remediations\n\n~~~md\n## Resources\n~~~\n\nFix it.\n\n## Resources\nLink.",
      "~~~md\n## Resources\n~~~\n\nFix it.",
    ],
    [
      "## Remediations\n\n````md\n```\n## References\n`````\n\nFix it.\n\n## References",
      "````md\n```\n## References\n`````\n\nFix it.",
    ],
    [
      "## Remediations\n\n  ```md\n## References\n  ```\n\nFix it.\n\n## References",
      "  ```md\n## References\n  ```\n\nFix it.",
    ],
  ])(
    "extracts the first section without rewriting Markdown (%#)",
    async (description, expected) => {
      const { candidates } = await normalize({ medium: [finding({ description })] });
      expect(candidates[0].description).toBe(description);
      expect(candidates[0].remediation).toBe(expected);
    },
  );

  it("trims long runs of blank lines in linear time", async () => {
    // Backtracking regexes took hours on the CRLF run and seconds on the LF run.
    const crlf = `first${"\r\n".repeat(64)}second`;
    const lf = `first${"\n \t".repeat(50_000)}\nsecond`;
    const { candidates } = await normalize({
      medium: [
        finding({ description: `## Remediations\r\n\r\n${crlf}${"\r\n".repeat(64)}` }),
        finding({ description: `## Remediations\n\n${lf}\n` }),
      ],
    });
    expect(candidates.map(({ remediation }) => remediation)).toEqual([crlf, lf]);
  });
});

describe("BearerJsonNormalizer sink location", () => {
  it.each([
    [{ start: 10 }, { startLine: 10 }],
    [
      { start: 10, end: 10, column: { start: 3, end: 8 } },
      { startLine: 10, endLine: 10, startColumn: 3, endColumn: 8 },
    ],
    [
      { start: 10, end: 12, column: { start: 8, end: 3 } },
      { startLine: 10, endLine: 12, startColumn: 8, endColumn: 3 },
    ],
    [
      { start: 10, column: { start: 3, end: 8 } },
      { startLine: 10, startColumn: 3, endColumn: 8 },
    ],
    [
      { start: 10, end: 12, column: { end: 8 } },
      { startLine: 10, endLine: 12, endColumn: 8 },
    ],
    [
      { start: 10, end: 12, column: { start: 3 } },
      { startLine: 10, endLine: 12, startColumn: 3 },
    ],
  ])(
    "prefers the sink and preserves valid coordinates and end conventions (%#)",
    async (sink, location) => {
      const { candidates, log } = await normalize({
        high: [
          finding({
            sink,
            source: { start: 1, end: 2, column: { start: 1, end: 2 } },
            line_number: 5,
            parent_line_number: 4,
          }),
        ],
      });
      expect(candidates[0].affectedResource).toEqual({
        type: "sourceCode",
        file: "src/example.rb",
        location,
      });
      expect(log.warn).not.toHaveBeenCalled();
    },
  );

  it.each([
    [{ start: 10, end: 9, column: { start: 3, end: 8 } }, "sink.end", {}],
    [{ start: 10, end: 10, column: { start: 3, end: 2 } }, "sink.column.end", { endLine: 10 }],
    [{ start: 10, column: { start: 3, end: 2 } }, "sink.column.end", {}],
  ])(
    "discards genuinely reversed ends while retaining the usable start (%#)",
    async (sink, field, validEnd) => {
      const { candidates, log } = await normalize({ high: [finding({ sink })] });
      expect(candidates[0].affectedResource).toEqual({
        type: "sourceCode",
        file: "src/example.rb",
        location: { startLine: 10, startColumn: 3, ...validEnd },
      });
      expect(log.warn).toHaveBeenCalledExactlyOnceWith(
        { sourceRecord: "/high/0", field },
        "bearer: ignoring unusable optional value",
      );
    },
  );

  it.each(["start", "end", "column.start", "column.end"])(
    "recovers malformed sink.%s independently",
    async (field) => {
      for (const value of [0, -1, 1.5, "SECRET", null, {}, [], true]) {
        const sink: Record<string, unknown> = { start: 10, end: 12, column: { start: 3, end: 8 } };
        if (field.startsWith("column.")) {
          sink.column = { start: 3, end: 8, [field.split(".")[1]]: value };
        } else {
          sink[field] = value;
        }
        const { candidates, log } = await normalize({ high: [finding({ sink, line_number: 5 })] });
        const location: Record<string, number> = {
          startLine: 10,
          endLine: 12,
          startColumn: 3,
          endColumn: 8,
        };
        if (field === "start") {
          expect(candidates[0].affectedResource).toEqual({
            type: "sourceCode",
            file: "src/example.rb",
            location: { startLine: 5 },
          });
        } else if (field === "end") {
          // The end column belongs to the unusable end line, not to the start line.
          expect(candidates[0].affectedResource).toEqual({
            type: "sourceCode",
            file: "src/example.rb",
            location: { startLine: 10, startColumn: 3 },
          });
        } else {
          delete location[field === "column.start" ? "startColumn" : "endColumn"];
          expect(candidates[0].affectedResource).toEqual({
            type: "sourceCode",
            file: "src/example.rb",
            location,
          });
        }
        expect(log.warn).toHaveBeenCalledExactlyOnceWith(
          { sourceRecord: "/high/0", field: `sink.${field}` },
          "bearer: ignoring unusable optional value",
        );
      }
    },
  );

  it.each([undefined, {}, { end: 12, column: { start: 3, end: 8 } }])(
    "uses only the fallback line when the sink start is absent (%#)",
    async (sink) => {
      const { candidates, log } = await normalize({ high: [finding({ sink, line_number: 5 })] });
      expect(candidates[0].affectedResource).toEqual({
        type: "sourceCode",
        file: "src/example.rb",
        location: { startLine: 5 },
      });
      expect(log.warn).not.toHaveBeenCalled();
    },
  );

  it.each([null, [], "SECRET", 42])("recovers malformed sink containers (%#)", async (sink) => {
    const { candidates, log } = await normalize({ high: [finding({ sink, line_number: 5 })] });
    expect(candidates[0].affectedResource).toMatchObject({ location: { startLine: 5 } });
    expect(log.warn).toHaveBeenCalledExactlyOnceWith(
      { sourceRecord: "/high/0", field: "sink" },
      "bearer: ignoring unusable optional value",
    );
  });

  it.each([null, [], "SECRET", 42])(
    "keeps usable lines with malformed column containers (%#)",
    async (column) => {
      const { candidates, log } = await normalize({
        high: [finding({ sink: { start: 10, end: 12, column } })],
      });
      expect(candidates[0].affectedResource).toEqual({
        type: "sourceCode",
        file: "src/example.rb",
        location: { startLine: 10, endLine: 12 },
      });
      expect(log.warn).toHaveBeenCalledExactlyOnceWith(
        { sourceRecord: "/high/0", field: "sink.column" },
        "bearer: ignoring unusable optional value",
      );
    },
  );

  it.each([undefined, 0, -1, 1.5, "SECRET", null, {}, []])(
    "retains the file when no start line is usable (%#)",
    async (line_number) => {
      const { candidates, log } = await normalize({
        high: [
          finding({
            line_number,
            source: { start: 1 },
            parent_line_number: 2,
            sink: { end: 12, column: { start: 3, end: 8 } },
          }),
        ],
      });
      expect(candidates[0].affectedResource).toEqual({
        type: "sourceCode",
        file: "src/example.rb",
      });
      expect(log.warn).toHaveBeenCalledTimes(line_number === undefined ? 0 : 1);
    },
  );
});

describe("BearerJsonNormalizer provenance and log safety", () => {
  it("retains raw extensions and invalid values without mutation, inferred identity, or source-value logs", async () => {
    const record = finding({
      id: "SECRET-rule",
      filename: "SECRET/path.ts",
      title: { "SECRET-property": "SECRET-title" },
      description: ["SECRET-description"],
      code_extract: { raw: "SECRET-snippet" },
      documentation_url: ["SECRET-url"],
      cwe_ids: ["79", "SECRET-cwe"],
      sink: { start: "SECRET-line", end: 12, column: { start: 3, end: 8 }, content: "SECRET-sink" },
      source: { start: 1 },
      line_number: 5,
      fingerprint: "SECRET_0",
      old_fingerprint: "SECRET-old_0",
      revision: "SECRET-revision",
      repository: "https://SECRET/repo",
      symbol: "SECRET-symbol",
      timestamp: "2026-01-01T00:00:00Z",
      unknown: { "SECRET-key": ["SECRET-value"] },
    });
    const raw = { high: [record], low: [finding()] };
    const input = bytes(raw);
    const original = input.slice();
    const log = logger();
    const candidates = await normalizer.normalize(input, log as unknown as Logger);
    expect(input).toEqual(original);
    expect(candidates).toHaveLength(2);
    expect(candidates[0].sourceMetadata).toEqual({
      provenance: { result: record, severity: "high", document: {} },
    });
    expect(candidates[0].affectedResource).toEqual({
      type: "sourceCode",
      file: record.filename,
      location: { startLine: 5 },
    });
    expect(candidates[0].assetIdentifierCandidates).toEqual([]);
    expect(candidates[0].observedAt).toBeNull();
    expect(log.warn.mock.calls.map(([fields]) => fields)).toEqual([
      { sourceRecord: "/high/0", field: "title" },
      { sourceRecord: "/high/0", field: "description" },
      { sourceRecord: "/high/0", field: "sink.start" },
      { sourceRecord: "/high/0", field: "code_extract" },
      { sourceRecord: "/high/0", field: "cwe_ids" },
      { sourceRecord: "/high/0", field: "documentation_url" },
    ]);
    expect(JSON.stringify(log.warn.mock.calls)).not.toContain("SECRET");
    expect(log.info).not.toHaveBeenCalled();
    expect(log.debug).not.toHaveBeenCalled();
  });
});
