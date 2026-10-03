import { readFileSync } from "node:fs";

import { observationAffectedResourceSchema } from "@exposurenexus/contracts/model/affected-resource";
import { describe, expect, it, vi } from "vitest";

import { Classifier } from "../classifier.js";
import { parseSarif } from "../sarif/parser.js";
import { ZapSarifNormalizer } from "./zap.js";

import type { Logger } from "pino";

const normalizer = new ZapSarifNormalizer();
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const location = (uri: string) => ({ physicalLocation: { artifactLocation: { uri } } });
const result = (overrides: Record<string, unknown> = {}) => ({
  ruleId: "opaque-rule",
  message: { text: "Instance message" },
  ...overrides,
});
const rule = (overrides: Record<string, unknown> = {}) => ({
  id: "opaque-rule",
  name: "Exported title",
  ...overrides,
});
const run = (
  results: unknown = [result()],
  rules: unknown[] = [rule()],
  overrides: Record<string, unknown> = {},
) => ({ tool: { driver: { name: "ZAP", version: "future", rules } }, results, ...overrides });
const report = (runs: unknown = [run()]) => ({ version: "2.1.0", runs });
function logger() {
  return { warn: vi.fn(), debug: vi.fn() };
}
async function normalize(raw: unknown) {
  const log = logger();
  const candidates = await normalizer.normalize(bytes(raw), log as unknown as Logger);
  return { candidates, log };
}

describe("ZapSarifNormalizer", () => {
  it("accepts the original report through the classifier without collapsing instances", async () => {
    const input = readFileSync(new URL("./fixtures/juiceshop.zap-sarif.json", import.meta.url));
    const parsed = parseSarif(input);
    const sourceRun = parsed.runs![0];
    const rawResults = sourceRun.results!;
    const log = logger();
    const classifier = new Classifier(log as unknown as Logger);
    classifier.registerNormalizer("zap", normalizer);
    const candidates = await classifier.normalize("zap", input);
    expect(candidates).toHaveLength(46);
    expect(
      new Set(
        rawResults.map(
          (entry) =>
            `${entry.ruleId}:${entry.locations?.[0].physicalLocation?.artifactLocation?.uri}`,
        ),
      ).size,
    ).toBe(39);
    expect(
      candidates.reduce<Record<string, number>>((counts, candidate) => {
        counts[candidate.severity] = (counts[candidate.severity] ?? 0) + 1;
        return counts;
      }, {}),
    ).toEqual({ high: 4, medium: 17, low: 15, info: 10 });
    const withCwe = candidates.filter(
      (candidate) => candidate.weakness.identifiers.cwe !== undefined,
    );
    expect(withCwe).toHaveLength(36);
    expect(new Set(withCwe.flatMap((candidate) => candidate.weakness.identifiers.zap)).size).toBe(
      12,
    );
    expect(new Set(withCwe.flatMap((candidate) => candidate.weakness.identifiers.cwe)).size).toBe(
      9,
    );
    for (const [index, candidate] of candidates.entries()) {
      const raw = rawResults[index];
      const descriptor = sourceRun.tool.driver.rules!.find((entry) => entry.id === raw.ruleId)!;
      expect(candidate).toMatchObject({
        source: "zap",
        sourceRecord: `/runs/0/results/${index}`,
        observedAt: null,
        title: descriptor.name,
        description: descriptor.fullDescription?.text,
        remediation:
          (descriptor.properties?.solution as { text?: string } | undefined)?.text || null,
        affectedResource: {
          type: "webEndpoint",
          scheme: "http",
          host: "localhost",
          port: 8080,
          component: { kind: "endpoint" },
          method: raw.webRequest?.method,
        },
        assetIdentifierCandidates: [{ type: "dnsName", namespace: null, value: "localhost" }],
      });
      expect(observationAffectedResourceSchema.safeParse(candidate.affectedResource).success).toBe(
        true,
      );
      expect(candidate.weakness.identifiers).not.toHaveProperty("cve");
      expect(candidate.sourceMetadata).toMatchObject({
        provenance: { result: raw, rule: descriptor },
      });
      const provenance = candidate.sourceMetadata.provenance as Record<string, unknown>;
      expect(provenance.document).not.toHaveProperty("runs");
      expect(provenance.run).not.toHaveProperty("results");
      // The shared rule catalog and taxa stay out of every candidate's provenance.
      const { rules: _rules, ...driver } = sourceRun.tool.driver;
      expect(provenance.run).toEqual(
        expect.objectContaining({
          tool: { ...sourceRun.tool, driver },
          taxonomies: sourceRun.taxonomies!.map(({ taxa: _taxa, ...taxonomy }) => taxonomy),
        }),
      );
      if (raw.message.text?.trim()) expect(candidate.evidence).toContain(raw.message.text);
      if (raw.locations?.[0].physicalLocation?.region?.snippet?.text)
        expect(candidate.evidence).toContain(raw.locations[0].physicalLocation.region.snippet.text);
      if (raw.webResponse?.body?.text)
        expect(candidate.evidence).toContain(raw.webResponse.body.text);
    }
    expect(candidates[0].evidence).toContain("CVE-2026-32635");
    expect(candidates[0].evidence).toContain("Request (exported fields)");
    expect(candidates[0].evidence).toContain("Response (exported fields)");
    const technology = candidates.filter((candidate) => candidate.title.includes("Onsen"));
    expect(technology.length).toBeGreaterThan(1);
    expect(new Set(technology.map((candidate) => candidate.evidence)).size).toBeGreaterThan(1);
  });

  it.each([[], [run([])]].map((runs) => ({ runs })))(
    "accepts explicit empty collections",
    async ({ runs }) => {
      expect((await normalize(report(runs))).candidates).toEqual([]);
    },
  );

  it.each(
    [
      null,
      [run(null)],
      [run(undefined, [], { results: undefined })],
      [run(), run(undefined, [], { results: undefined })],
      [run([], [], { tool: { driver: { name: "Other" } } })],
      [run(), run([], [], { tool: { driver: { name: "Other" } } })],
    ].map((runs) => ({ runs })),
  )("rejects unavailable analysis and non-ZAP runs atomically (%#)", async ({ runs }) => {
    await expect(normalize(report(runs))).rejects.toThrow();
  });

  it("retains unsuccessful runs, source ordering, suppressions and confidence", async () => {
    const raw = report([
      run(
        [result({ suppressions: [{ kind: "external", status: "accepted" }] })],
        [rule({ properties: { confidence: "falsepositive" } })],
        { invocations: [{ executionSuccessful: false }] },
      ),
      run([result({ message: { text: "Second" } })]),
    ]);
    const { candidates } = await normalize(raw);
    expect(candidates.map((candidate) => candidate.sourceRecord)).toEqual([
      "/runs/0/results/0",
      "/runs/1/results/0",
    ]);
    expect(candidates[0].sourceMetadata).toMatchObject({
      provenance: { run: { invocations: [{ executionSuccessful: false }] } },
    });
  });

  it("preserves identical result instances through final canonicalization", async () => {
    const log = logger();
    const classifier = new Classifier(log as unknown as Logger);
    classifier.registerNormalizer("zap", normalizer);
    const candidates = await classifier.normalize(
      "zap",
      bytes(report([run([result(), result()])])),
    );
    expect(candidates.map((candidate) => candidate.sourceRecord)).toEqual([
      "/runs/0/results/0",
      "/runs/0/results/1",
    ]);
  });

  it("retains every result in a run larger than the function-argument limit", async () => {
    const count = 130_000;
    const results = Array.from({ length: count }, () => result({ message: { id: "m" } }));
    const { candidates } = await normalize(report([run(results)]));

    expect(candidates).toHaveLength(count);
    expect(candidates[0].sourceRecord).toBe("/runs/0/results/0");
    expect(candidates.at(-1)?.sourceRecord).toBe(`/runs/0/results/${count - 1}`);
  }, 20_000);

  it("falls back from unusable location authorities and request methods", async () => {
    const { candidates, log } = await normalize(
      report([
        run([
          result({
            locations: [location("http:///unusable-host")],
            webRequest: { target: "https://example.com/", method: "SECRET METHOD" },
          }),
        ]),
      ]),
    );
    expect(candidates[0].affectedResource).toMatchObject({ host: "example.com", scheme: "https" });
    expect(candidates[0].affectedResource).not.toHaveProperty("method");
    expect(JSON.stringify(log.warn.mock.calls)).not.toContain("SECRET");
  });

  it("filters only explicit non-detections and absent baseline results", async () => {
    const kinds = [undefined, "fail", "informational", "open", "review", "pass", "notApplicable"];
    const { candidates } = await normalize(
      report([
        run([
          ...kinds.map((kind) => result({ kind })),
          result({ baselineState: "absent" }),
          result({ kind: "pass", ruleId: undefined }),
        ]),
      ]),
    );
    expect(candidates.map((candidate) => candidate.sourceRecord)).toEqual(
      [0, 1, 2, 3, 4].map((index) => `/runs/0/results/${index}`),
    );
    await expect(
      normalize(report([run([result({ kind: "pass", level: "invalid" })])])),
    ).rejects.toThrow("sarif:");
  });

  it.each([undefined, "", "  "])("requires a nonblank retained rule ID %j", async (ruleId) => {
    await expect(normalize(report([run([result({ ruleId })])]))).rejects.toThrow(/ruleId/u);
  });

  it("warns for missing rules and preserves opaque IDs and unconsumed references", async () => {
    const raw = result({
      ruleId: " Custom.Rule/01 ",
      ruleIndex: 99,
      rule: { id: "different", index: 12 },
    });
    const { candidates, log } = await normalize(report([run([raw], [])]));
    expect(candidates[0]).toMatchObject({
      title: raw.ruleId,
      // SARIF failures without a level or rule default are warnings.
      severity: "medium",
      description: null,
      remediation: null,
      weakness: { identifiers: { zap: [raw.ruleId] } },
    });
    expect(candidates[0].sourceMetadata).toMatchObject({ provenance: { result: raw } });
    expect(log.warn).toHaveBeenCalled();
  });

  it("rejects ambiguous exact rule matches", async () => {
    await expect(
      normalize(report([run([result()], [rule(), rule({ name: "Another title" })])])),
    ).rejects.toThrow("ambiguous driver rules");
  });

  it.each([
    ["error", "note", "high"],
    ["warning", "error", "medium"],
    ["note", "error", "low"],
    ["none", "error", "info"],
    [undefined, "warning", "medium"],
    [undefined, "none", "info"],
    [undefined, undefined, "medium"],
  ])("maps result/default levels %j/%j to %j", async (level, fallback, expected) => {
    const { candidates } = await normalize(
      report([run([result({ level })], [rule({ defaultConfiguration: { level: fallback } })])]),
    );
    expect(candidates[0].severity).toBe(expected);
  });

  it.each([
    [undefined, "high"],
    ["fail", "high"],
    ["open", "info"],
    ["review", "info"],
    ["informational", "info"],
  ])("applies the rule default level only to failures of kind %j", async (kind, expected) => {
    const { candidates } = await normalize(
      report([run([result({ kind })], [rule({ defaultConfiguration: { level: "error" } })])]),
    );
    expect(candidates[0].severity).toBe(expected);
  });

  it.each([
    [" ", "Short description", "Short description"],
    [undefined, undefined, "opaque-rule"],
  ])(
    "uses title fallbacks without reconstructing instance names",
    async (name, short, expected) => {
      const { candidates } = await normalize(
        report([
          run(
            [result()],
            [rule({ name, shortDescription: short === undefined ? undefined : { text: short } })],
          ),
        ]),
      );
      expect(candidates[0].title).toBe(expected);
    },
  );

  it.each([
    ["http://Example.COM/a?token=1", "example.com", 80, "dnsName", "example.com"],
    ["https://example.com/", "example.com", 443, "dnsName", "example.com"],
    ["https://127.0.0.1:8443/", "127.0.0.1", 8443, "ipAddress", "127.0.0.1"],
    ["http://[2001:db8::1]/", "[2001:db8::1]", 80, "ipAddress", "2001:db8::1"],
  ])(
    "maps structured endpoints and canonical identifiers for %s",
    async (url, host, port, type, value) => {
      const { candidates } = await normalize(
        report([
          run([
            result({
              locations: [location(url as string)],
              webRequest: { method: "POST" },
              message: { text: "Evidence mentions 10.0.0.1 and https://other.example" },
            }),
          ]),
        ]),
      );
      expect(candidates[0]).toMatchObject({
        affectedResource: {
          host,
          port,
          reportedUrl: url,
          method: "POST",
          component: { kind: "endpoint" },
        },
        assetIdentifierCandidates: [{ type, value, namespace: null }],
      });
      expect(
        observationAffectedResourceSchema.safeParse(candidates[0].affectedResource).success,
      ).toBe(true);
    },
  );

  it("uses the first equivalent location, preserving query text without fan-out", async () => {
    const { candidates } = await normalize(
      report([
        run([
          result({
            locations: [
              location("http://EXAMPLE.com:80/a?first=1"),
              location("http://example.com/a?second=2"),
            ],
            webRequest: { target: "https://other.example" },
          }),
        ]),
      ]),
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0].affectedResource).toMatchObject({
      reportedUrl: "http://EXAMPLE.com:80/a?first=1",
      path: "/a",
    });
  });

  it("retains conflicting endpoints as unspecified even with a request fallback", async () => {
    const { candidates } = await normalize(
      report([
        run([
          result({
            locations: [location("https://example.com/a"), location("https://example.com/b")],
            webRequest: { target: "https://example.com/a" },
          }),
        ]),
      ]),
    );
    expect(candidates[0]).toMatchObject({
      affectedResource: { type: "unspecified" },
      assetIdentifierCandidates: [],
    });
  });

  it("leaves relative and indexed references unresolved and uses request fallback", async () => {
    const locations = [
      location("relative.ts"),
      { physicalLocation: { artifactLocation: { index: 0 } } },
    ];
    const { candidates } = await normalize(
      report([
        run(
          [
            result({ locations }),
            result({ locations, webRequest: { target: "https://example.com/" } }),
            result({ message: { text: "Only evidence https://example.com" } }),
          ],
          [rule()],
          { artifacts: [{ location: { uri: "https://ignored.example/" } }] },
        ),
      ]),
    );
    expect(candidates.map((candidate) => candidate.affectedResource.type)).toEqual([
      "unspecified",
      "webEndpoint",
      "unspecified",
    ]);
    expect(candidates[1].affectedResource).not.toHaveProperty("method");
  });

  it("retains usable optional enrichment while warning safely and preserving originals", async () => {
    const descriptor = rule({
      properties: {
        solution: { text: { SECRET: "payload" } },
        references: ["https://example.com/", 42, "https://example.com/"],
      },
      relationships: [
        {
          kinds: ["superset"],
          target: {
            id: "89",
            toolComponent: { name: "CWE", guid: "b000a760-3e52-3565-a35c-f61369da53b7" },
          },
        },
        { kinds: ["superset"], target: { id: "-1", toolComponent: { name: "CWE" } } },
        { kinds: ["superset"], target: { id: "SECRET", toolComponent: { name: "CWE" } } },
        { kinds: ["subset"], target: { id: "79", toolComponent: { name: "CWE" } } },
        { kinds: ["superset"], target: { id: "90", toolComponent: { name: "Other" } } },
      ],
    });
    const raw = report([
      run([result()], [descriptor], {
        taxonomies: [
          { name: "CWE", guid: "b000a760-3e52-3565-a35c-f61369da53b7", taxa: [{ id: "999" }] },
        ],
      }),
    ]);
    const { candidates, log } = await normalize(raw);
    expect(candidates[0]).toMatchObject({
      remediation: null,
      weakness: {
        identifiers: { zap: ["opaque-rule"], cwe: ["CWE-89"] },
        references: ["https://example.com/"],
      },
    });
    expect(candidates[0].sourceMetadata).toMatchObject({ provenance: { rule: descriptor } });
    expect(log.warn).toHaveBeenCalled();
    expect(JSON.stringify(log.warn.mock.calls)).not.toMatch(/SECRET|payload|example\.com/u);
    const classifier = new Classifier(log as unknown as Logger);
    classifier.registerNormalizer("zap", normalizer);
    expect(await classifier.normalize("zap", bytes(raw))).toHaveLength(1);
  });

  it("preserves multiline evidence, attacks, truncated and binary bodies, and surrounding provenance", async () => {
    const rawResult = result({
      message: { text: "Message\nsecond line\n" },
      locations: [
        {
          ...location("http://localhost/file.js"),
          properties: { attack: "<script>\nattack\n</script>" },
          physicalLocation: {
            artifactLocation: { uri: "http://localhost/file.js" },
            region: { startLine: 1, snippet: { text: "snippet [...]\n" } },
          },
        },
      ],
      webRequest: {
        method: "GET",
        target: "http://localhost/file.js",
        body: { text: "request\nbody\n" },
      },
      webResponse: {
        statusCode: 200,
        headers: { Date: "Wed, 16 Sep 2026 18:16:41 GMT" },
        body: { binary: "YWJj", text: "[...]response\nbody\n" },
      },
    });
    const context = {
      properties: { arbitrary: ["context"] },
      originalUriBaseIds: { ROOT: { uri: "file:///tmp/" } },
    };
    const raw = {
      ...report([run([rawResult, result({ message: { text: "SIBLING" } })], [rule()], context)]),
      properties: { document: "context" },
    };
    const { candidates } = await normalize(raw);
    expect(candidates[0].evidence).toContain("<script>\nattack\n</script>");
    expect(candidates[0].evidence).toContain("snippet [...]\n");
    expect(candidates[0].evidence).toContain("request\nbody\n");
    expect(candidates[0].evidence).toContain("[...]response\nbody\n");
    expect(candidates[0].evidence).not.toContain("YWJj");
    expect(candidates[0].sourceMetadata).toMatchObject({
      provenance: {
        result: rawResult,
        document: { properties: { document: "context" } },
        run: context,
      },
    });
    expect(JSON.stringify(candidates[0].sourceMetadata)).not.toContain("SIBLING");
    expect(candidates[0].observedAt).toBeNull();
    expect(candidates[0].affectedResource.type).toBe("webEndpoint");
  });

  it("uses null when there is no displayable evidence", async () => {
    const { candidates } = await normalize(
      report([
        run([result({ message: { id: "message-id" }, webResponse: { body: { binary: "YWJj" } } })]),
      ]),
    );
    expect(candidates[0].evidence).toBeNull();
  });

  it.each([
    {
      label: "Body (rendered)",
      fields: { webRequest: { body: { rendered: { text: "Available evidence\nsecond line" } } } },
    },
    {
      label: "Body (rendered)",
      fields: { webResponse: { body: { rendered: { text: "Available evidence\nsecond line" } } } },
    },
    {
      label: "Snippet (rendered)",
      fields: {
        locations: [
          {
            physicalLocation: {
              artifactLocation: { uri: "http://localhost/" },
              region: {
                startLine: 1,
                snippet: { rendered: { text: "Available evidence\nsecond line" } },
              },
            },
          },
        ],
      },
    },
    {
      label: "Context Snippet (rendered)",
      fields: {
        locations: [
          {
            physicalLocation: {
              artifactLocation: { uri: "http://localhost/" },
              contextRegion: {
                startLine: 1,
                snippet: { rendered: { text: "Available evidence\nsecond line" } },
              },
            },
          },
        ],
      },
    },
  ])("displays rendered-only evidence with a $label label (%#)", async ({ label, fields }) => {
    const raw = result({ message: { id: "m" }, ...fields });
    const { candidates } = await normalize(report([run([raw])]));

    expect(candidates[0].evidence).toContain(label);
    expect(candidates[0].evidence).toContain("Available evidence\nsecond line");
    expect(candidates[0].sourceMetadata).toMatchObject({ provenance: { result: raw } });
  });

  it("prefers original text over rendered evidence while preserving both in provenance", async () => {
    const content = { text: "Original text", rendered: { text: "Rendered version" } };
    const raw = result({
      message: { id: "m" },
      webResponse: { body: content },
      locations: [
        {
          physicalLocation: {
            artifactLocation: { uri: "http://localhost/" },
            region: { startLine: 1, snippet: content },
          },
        },
      ],
    });
    const { candidates } = await normalize(report([run([raw])]));

    expect(candidates[0].evidence).toContain("Original text");
    expect(candidates[0].evidence).not.toContain("Rendered version");
    expect(candidates[0].sourceMetadata).toMatchObject({ provenance: { result: raw } });
  });

  it.each([
    "https://\\example.com/",
    "https://exam\nple.com/",
    "https://exam\tple.com/",
    "https://example.com/has a space",
    "https://example.com/%XX",
    "https://example.com/\n",
  ])("does not repair malformed request target %j into asset identity", async (target) => {
    const log = logger();
    const classifier = new Classifier(log as unknown as Logger);
    classifier.registerNormalizer("zap", normalizer);
    const candidates = await classifier.normalize(
      "zap",
      bytes(report([run([result({ webRequest: { target } })])])),
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      affectedResource: { type: "unspecified" },
      assetIdentifierCandidates: [],
    });
    expect(candidates[0].sourceMetadata).toMatchObject({
      provenance: { result: { webRequest: { target } } },
    });
  });

  it.each([
    ["equal", true],
    ["superset", true],
    ["subset", false],
    ["relevant", false],
  ])("classifies CWE only for %s relationships", async (kind, expected) => {
    const descriptor = rule({
      relationships: [{ kinds: [kind], target: { id: "89", toolComponent: { name: "CWE" } } }],
    });
    const { candidates } = await normalize(
      report([run([result()], [descriptor], { taxonomies: [{ name: "CWE" }] })]),
    );
    expect(candidates[0].weakness.identifiers.cwe).toEqual(expected ? ["CWE-89"] : undefined);
  });

  it("matches taxonomy GUIDs case-insensitively while preserving original spelling", async () => {
    const guid = "b000a760-3e52-3565-a35c-f61369da53b7";
    const descriptor = rule({
      relationships: [
        {
          kinds: ["superset"],
          target: { id: "89", toolComponent: { name: "CWE", guid: guid.toUpperCase() } },
        },
      ],
    });
    const { candidates } = await normalize(
      report([run([result()], [descriptor], { taxonomies: [{ name: "CWE", guid }] })]),
    );
    expect(candidates[0].weakness.identifiers.cwe).toEqual(["CWE-89"]);
    expect(candidates[0].sourceMetadata).toMatchObject({
      provenance: { rule: descriptor, run: { taxonomies: [{ name: "CWE", guid }] } },
    });
  });

  it("renders request parameters even without other displayable evidence", async () => {
    const parameters = { payload: "line1\nline2", empty: "", ["__proto__"]: "literal parameter" };
    const { candidates } = await normalize(
      report([run([result({ message: { id: "m" }, webRequest: { parameters } })])]),
    );
    expect(candidates[0].evidence).toContain("Request Parameters");
    expect(candidates[0].evidence).toContain("payload: line1\nline2");
    expect(candidates[0].evidence).toContain("empty: ");
    expect(candidates[0].evidence).toContain("__proto__: literal parameter");
    expect(candidates[0].sourceMetadata).toMatchObject({
      provenance: { result: { webRequest: { parameters } } },
    });
  });
});
