import { AffectedResourceType } from "@exposurenexus/contracts/model/affected-resource";
import { FindingStatus } from "@exposurenexus/contracts/model/finding";
import { VulnerabilitySeverity } from "@exposurenexus/contracts/model/vulnerability";
import { describe, expect, it, vi } from "vitest";

import { IdentityFindingMatcher } from "./identity-matcher.js";

import type { ObservationCandidate } from "../classifier.js";
import type { FindingIdentity, FindingIdentitySource } from "./identity-matcher.js";
import type {
  FindingAffectedResource,
  ObservationAffectedResource,
} from "@exposurenexus/contracts/model/affected-resource";
import type { ObservationFingerprints } from "@exposurenexus/contracts/model/observation";
import type { Logger } from "pino";

const assetId = "asset";
const logger = { debug: vi.fn() } as unknown as Logger;

function candidate(
  identifiers: Record<string, string[]>,
  affectedResource: ObservationAffectedResource,
  fingerprints: ObservationFingerprints = {},
): ObservationCandidate {
  return {
    source: "scanner",
    sourceRecord: "results[0]",
    title: "Example detection",
    description: null,
    remediation: null,
    evidence: null,
    severity: VulnerabilitySeverity.High,
    weakness: { identifiers },
    affectedResource,
    observedAt: null,
    assetIdentifierCandidates: [],
    fingerprints,
    sourceMetadata: {},
  };
}

function finding(
  id: string,
  identifiers: Record<string, string[]>,
  affectedResource: FindingAffectedResource,
  fields: Partial<FindingIdentity> = {},
): FindingIdentity {
  return {
    id,
    assetId,
    status: FindingStatus.Active,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    weakness: { identifiers },
    affectedResource,
    fingerprints: {},
    ...fields,
  };
}

function source(findings: FindingIdentity[]): FindingIdentitySource {
  return { listFindings: vi.fn(async () => findings) };
}

async function match(findings: FindingIdentity[], candidates: ObservationCandidate[]) {
  return new IdentityFindingMatcher(source(findings)).match(assetId, candidates, logger);
}

function pkg(name: string, installationPath?: string, version?: string) {
  return {
    type: AffectedResourceType.Package,
    ecosystem: "npm",
    name,
    ...(installationPath === undefined ? {} : { installationPath }),
    ...(version === undefined ? {} : { version }),
  } as const;
}

function code(file: string, startLine: number, locationFingerprint?: string) {
  return {
    type: AffectedResourceType.SourceCode,
    file,
    location: { startLine },
    ...(locationFingerprint === undefined ? {} : { locationFingerprint }),
  } as const;
}

/** A source code result with a full span on one line, as Semgrep and Bearer report it. */
function span(file: string, startLine: number, startColumn: number, endColumn: number) {
  return {
    type: AffectedResourceType.SourceCode,
    file,
    location: { startLine, startColumn, endLine: startLine, endColumn },
  } as const;
}

function cve(id: string, cwe?: string): Record<string, string[]> {
  return { cve: [id], trivy: [id], ...(cwe === undefined ? {} : { cwe: [cwe] }) };
}

const lockfile = "app/package-lock.json";
const xss = { cwe: ["CWE-79"], semgrep: ["xss-direct-write"] };

describe("IdentityFindingMatcher structural identity", () => {
  it("matches exact weakness and resource identity in any status despite version drift", async () => {
    const results = await match(
      [
        finding("mitigated", cve("CVE-2026-1001"), pkg("express", lockfile), {
          status: FindingStatus.Mitigated,
        }),
      ],
      [candidate(cve("CVE-2026-1001"), pkg("express", lockfile, "1.0.1"))],
    );
    expect(results).toEqual([
      expect.objectContaining({ status: "matched", findingId: "mitigated" }),
    ]);
  });

  it("prefers a non-duplicate finding, then the oldest, among equal identities", async () => {
    const older = new Date("2025-06-01T00:00:00.000Z");
    const identity = [cve("CVE-2026-1007"), pkg("lodash", lockfile)] as const;
    const [canonical] = await match(
      [
        finding("duplicate", ...identity, { status: FindingStatus.Duplicate, createdAt: older }),
        finding("canonical", ...identity),
      ],
      [candidate(...identity)],
    );
    const [oldest] = await match(
      [finding("newer", ...identity), finding("older", ...identity, { createdAt: older })],
      [candidate(...identity)],
    );

    expect(canonical).toMatchObject({ status: "matched", findingId: "canonical" });
    expect(canonical.explanation).toContain("2 findings with equal identity");
    expect(oldest).toMatchObject({ status: "matched", findingId: "older" });
  });

  it("matches a unique partial identity and abstains when it fits several findings", async () => {
    const root = finding(
      "root",
      cve("CVE-2026-1009"),
      pkg("minimist", "app/node_modules/minimist"),
    );
    const nested = finding(
      "nested",
      cve("CVE-2026-1009"),
      pkg("minimist", "app/node_modules/x/node_modules/minimist"),
    );
    const pathless = candidate(cve("CVE-2026-1009"), pkg("minimist"));

    expect(await match([root], [pathless])).toEqual([
      expect.objectContaining({ status: "matched", findingId: "root" }),
    ]);
    expect(await match([root, nested], [pathless])).toEqual([
      expect.objectContaining({ status: "unresolved", reason: "ambiguous" }),
    ]);
  });

  it("matches a CWE-only manual finding on its exact location", async () => {
    const results = await match(
      [finding("manual", { cwe: ["CWE-89"] }, code("src/orders/lookup.ts", 27))],
      [
        candidate(
          { cwe: ["CWE-89"], semgrep: ["sequelize-injection"] },
          code("src/orders/lookup.ts", 27),
        ),
      ],
    );
    expect(results).toEqual([expect.objectContaining({ status: "matched", findingId: "manual" })]);
  });

  it.each<[string, FindingIdentity, ObservationCandidate]>([
    [
      "another CVE on the same package",
      finding("other", cve("CVE-2026-1011"), pkg("openssl")),
      candidate(cve("CVE-2026-1001"), pkg("openssl")),
    ],
    [
      "a broad CWE shared by rules of different scanners",
      finding(
        "zap",
        { cwe: ["CWE-693"], zap: ["10021"] },
        { type: AffectedResourceType.WebEndpoint, host: "shop.example.test" },
      ),
      candidate(
        { cwe: ["CWE-693"], nuclei: ["missing-headers"] },
        { type: AffectedResourceType.WebEndpoint, host: "shop.example.test" },
      ),
    ],
    [
      "an unspecified resource next to a typed finding",
      finding(
        "typed",
        { zap: ["10021"] },
        { type: AffectedResourceType.WebEndpoint, host: "shop.example.test" },
      ),
      candidate({ zap: ["10021"] }, { type: AffectedResourceType.Unspecified }),
    ],
  ])("seeds a new finding for %s", async (_case, existing, input) => {
    expect(await match([existing], [input])).toEqual([expect.objectContaining({ status: "new" })]);
  });
});

describe("IdentityFindingMatcher fingerprints", () => {
  const search = finding("search", xss, code("src/search.ts", 40, "9c1f"), {
    fingerprints: { semgrep: ["9c1f"] },
  });
  const profile = finding("profile", xss, code("src/profile.ts", 18, "5e0d"), {
    fingerprints: { semgrep: ["5e0d"] },
  });

  it("follows a source fingerprint across line shifts", async () => {
    const results = await match(
      [search, profile],
      [candidate(xss, code("src/search.ts", 52), { semgrep: ["9c1f"] })],
    );
    expect(results).toEqual([
      expect.objectContaining({
        status: "matched",
        findingId: "search",
        explanation: "Fingerprints (semgrep) matched one finding.",
      }),
    ]);
  });

  it("follows a finding's location fingerprint without observation fingerprints", async () => {
    const results = await match(
      [{ ...search, fingerprints: {} }],
      [candidate(xss, code("src/search.ts", 52, "9c1f"))],
    );
    expect(results).toEqual([expect.objectContaining({ status: "matched", findingId: "search" })]);
  });

  it("keeps a fingerprinted finding whose resource a user edited", async () => {
    const edited = { ...search, affectedResource: code("src/routes/search.ts", 40, "9c1f") };
    const results = await match(
      [edited],
      [candidate(xss, code("src/search.ts", 40), { semgrep: ["9c1f"] })],
    );
    expect(results).toEqual([expect.objectContaining({ status: "matched", findingId: "search" })]);
  });

  it("compares fingerprints only within one namespace", async () => {
    const results = await match(
      [profile],
      [
        candidate({ cwe: ["CWE-328"], sarif: ["weak-hash"] }, code("src/tokens.ts", 9), {
          sarif: ["5e0d"],
        }),
      ],
    );
    expect(results).toEqual([expect.objectContaining({ status: "new" })]);
  });

  it("reports a fingerprint naming one finding while identity names another as conflicting", async () => {
    const results = await match(
      [search, profile],
      [candidate(xss, code("src/profile.ts", 18), { semgrep: ["9c1f"] })],
    );
    expect(results).toEqual([
      expect.objectContaining({ status: "unresolved", reason: "conflicting_evidence" }),
    ]);
  });

  it("reports fingerprints pointing at findings with different identities as conflicting", async () => {
    const results = await match(
      [search, profile],
      [candidate(xss, code("src/other.ts", 1), { semgrep: ["9c1f", "5e0d"] })],
    );
    expect(results).toEqual([
      expect.objectContaining({ status: "unresolved", reason: "conflicting_evidence" }),
    ]);
  });
});

describe("IdentityFindingMatcher drift pairing", () => {
  const leak = { bearer: ["logger-leak"], cwe: ["CWE-532"] };
  const sameStatus = (results: { status: string }[]) => results.map((result) => result.status);

  it("follows results that shifted together in their file, in order", async () => {
    const results = await match(
      [
        finding("first", leak, span("src/server.ts", 10, 5, 40)),
        finding("second", leak, span("src/server.ts", 25, 9, 30)),
        finding("third", leak, span("src/server.ts", 40, 5, 61)),
      ],
      [
        candidate(leak, span("src/server.ts", 46, 5, 61)),
        candidate(leak, span("src/server.ts", 16, 5, 40)),
        candidate(leak, span("src/server.ts", 31, 9, 30)),
      ],
    );
    expect(results.map((result) => result.status === "matched" && result.findingId)).toEqual([
      "third",
      "first",
      "second",
    ]);
    expect(results[0].explanation).toBe(
      "Weakness (bearer) and sourceCode identity matched one finding after an order-preserving line shift in its file.",
    );
  });

  it("keeps results on one line apart by their columns", async () => {
    const results = await match(
      [
        finding("narrow", xss, span("src/a.ts", 46, 34, 82)),
        finding("wide", xss, span("src/a.ts", 46, 34, 106)),
      ],
      [candidate(xss, span("src/a.ts", 46, 34, 106)), candidate(xss, span("src/a.ts", 50, 34, 82))],
    );
    expect(results.map((result) => result.status === "matched" && result.findingId)).toEqual([
      "wide",
      "narrow",
    ]);
  });

  it("moves candidates with equal identity together", async () => {
    const shifted = candidate(leak, span("src/a.ts", 14, 5, 40));
    const results = await match(
      [finding("leak", leak, span("src/a.ts", 10, 5, 40))],
      [shifted, structuredClone(shifted)],
    );
    expect(results.map((result) => result.status === "matched" && result.findingId)).toEqual([
      "leak",
      "leak",
    ]);
  });

  it("abstains on a changed span while a finding in its file stays unpaired", async () => {
    const results = await match(
      [finding("logger", leak, span("lib/restore.ts", 32, 5, 103))],
      [candidate(leak, span("lib/restore.ts", 37, 7, 79))],
    );
    expect(results).toEqual([
      expect.objectContaining({
        status: "unresolved",
        reason: "ambiguous",
        explanation:
          "The weakness (bearer) and sourceCode identity fit no finding exactly, and 1 unpaired finding with that weakness in its file may have moved.",
      }),
    ]);
  });

  it("seeds a new finding once every finding in its file is paired", async () => {
    const results = await match(
      [finding("leak", leak, span("src/a.ts", 10, 5, 40))],
      [candidate(leak, span("src/a.ts", 14, 5, 40)), candidate(leak, span("src/a.ts", 60, 3, 18))],
    );
    expect(sameStatus(results)).toEqual(["matched", "new"]);
  });

  it("pairs only within one weakness, file, and symbol", async () => {
    const results = await match(
      [
        finding("other-file", leak, span("src/b.ts", 10, 5, 40)),
        finding("other-rule", xss, span("src/a.ts", 10, 5, 40)),
      ],
      [candidate(leak, span("src/a.ts", 14, 5, 40))],
    );
    expect(sameStatus(results)).toEqual(["new"]);
  });

  it("follows a resized IaC block through its symbol, but not through a placeholder", async () => {
    const block = (symbol: string, startLine: number, endLine: number) =>
      ({
        type: AffectedResourceType.SourceCode,
        file: "main.tf",
        symbol,
        location: { startLine, endLine },
      }) as const;
    const check = { checkov: ["CKV_AWS_18"] };
    expect(
      await match(
        [finding("bucket", check, block("aws_s3_bucket.data", 4, 12))],
        [candidate(check, block("aws_s3_bucket.data", 12, 23))],
      ),
    ).toEqual([expect.objectContaining({ status: "matched", findingId: "bucket" })]);
    expect(
      sameStatus(
        await match(
          [finding("unnamed", check, block("N/A", 4, 12))],
          [candidate(check, block("N/A", 12, 23))],
        ),
      ),
    ).toEqual(["unresolved"]);
  });

  it("abstains instead of pairing a finding that fits two buckets", async () => {
    const results = await match(
      [finding("merged", { semgrep: ["rule-a", "rule-b"] }, span("src/a.ts", 10, 5, 40))],
      [
        candidate({ semgrep: ["rule-a"] }, span("src/a.ts", 14, 5, 40)),
        candidate({ semgrep: ["rule-b"] }, span("src/a.ts", 14, 5, 40)),
      ],
    );
    expect(results).toEqual([
      expect.objectContaining({ status: "unresolved", reason: "ambiguous" }),
      expect.objectContaining({ status: "unresolved", reason: "ambiguous" }),
    ]);
  });

  it("never pairs a finding that another candidate's evidence reached", async () => {
    const search = finding("search", xss, code("src/search.ts", 40), {
      fingerprints: { semgrep: ["9c1f"] },
    });
    const results = await match(
      [search, finding("other", xss, code("src/search.ts", 70))],
      [
        candidate(xss, code("src/search.ts", 70), { semgrep: ["9c1f"] }),
        candidate(xss, code("src/search.ts", 90)),
      ],
    );
    expect(results).toEqual([
      expect.objectContaining({ status: "unresolved", reason: "conflicting_evidence" }),
      expect.objectContaining({ status: "new" }),
    ]);
  });
});

describe("IdentityFindingMatcher batches", () => {
  it("returns index-aligned decisions and groups equal new identities", async () => {
    const results = await match(
      [finding("openssl", cve("CVE-2026-1001"), pkg("openssl"))],
      [
        candidate(cve("CVE-2026-1020"), pkg("semver", lockfile)),
        candidate(cve("CVE-2026-1001"), pkg("openssl")),
        candidate(cve("CVE-2026-1021"), pkg("semver", lockfile)),
        candidate(cve("CVE-2026-1020"), pkg("semver", lockfile)),
        candidate(cve("CVE-2026-1001"), pkg("openssl")),
      ],
    );

    expect(results.map((result) => result.status)).toEqual([
      "new",
      "matched",
      "new",
      "new",
      "matched",
    ]);
    const groups = results.map((result) => (result.status === "new" ? result.group : null));
    expect(groups[0]).toBe(groups[3]);
    expect(groups[0]).not.toBe(groups[2]);
    expect(results[0].explanation).toContain("2 candidates in the batch seed it together");
  });

  it("abstains when other candidate identities claim the same finding through partial identity", async () => {
    const manual = finding("manual", { cwe: ["CWE-1321"] }, pkg("lodash", lockfile));
    const results = await match(
      [manual],
      [
        candidate(cve("CVE-2026-1101", "CWE-1321"), pkg("lodash", lockfile)),
        candidate(cve("CVE-2026-1102", "CWE-1321"), pkg("lodash", lockfile)),
      ],
    );
    expect(results).toEqual([
      expect.objectContaining({ status: "unresolved", reason: "ambiguous" }),
      expect.objectContaining({ status: "unresolved", reason: "ambiguous" }),
    ]);
  });

  it("keeps partial claims shared by candidates of one identity", async () => {
    const manual = finding("manual", { cwe: ["CWE-1321"] }, pkg("lodash", lockfile));
    const sibling = candidate(cve("CVE-2026-1101", "CWE-1321"), pkg("lodash", lockfile));
    const results = await match([manual], [sibling, structuredClone(sibling)]);
    expect(results.map((result) => result.status === "matched" && result.findingId)).toEqual([
      "manual",
      "manual",
    ]);
  });

  it("abstains on a partial claim when another identity claims that finding exactly", async () => {
    const results = await match(
      [finding("lodash", cve("CVE-2026-1007"), pkg("lodash", lockfile))],
      [
        candidate(cve("CVE-2026-1007"), pkg("lodash", lockfile)),
        candidate(cve("CVE-2026-1007"), pkg("lodash")),
      ],
    );
    expect(results).toEqual([
      expect.objectContaining({ status: "matched", findingId: "lodash" }),
      expect.objectContaining({ status: "unresolved", reason: "ambiguous" }),
    ]);
  });

  it("folds an incomplete new identity into its single compatible group", async () => {
    const results = await match(
      [],
      [
        candidate(cve("CVE-2026-1009"), pkg("minimist")),
        candidate(cve("CVE-2026-1009"), pkg("minimist", lockfile)),
      ],
    );
    expect(results.map((result) => result.status)).toEqual(["new", "new"]);
    expect(results[0]).toMatchObject({ group: (results[1] as { group: string }).group });
  });

  it("abstains on an incomplete new identity that fits several groups", async () => {
    const results = await match(
      [],
      [
        candidate(cve("CVE-2026-1009"), pkg("minimist", "a/package-lock.json")),
        candidate(cve("CVE-2026-1009"), pkg("minimist")),
        candidate(cve("CVE-2026-1009"), pkg("minimist", "b/package-lock.json")),
      ],
    );
    expect(
      results.map((result) => (result.status === "unresolved" ? result.reason : result.status)),
    ).toEqual(["new", "ambiguous", "new"]);
    expect(results[0]).not.toMatchObject({ group: (results[2] as { group: string }).group });
  });

  it("returns no decisions for an empty batch", async () => {
    expect(await match([], [])).toEqual([]);
  });
});

describe("IdentityFindingMatcher evidence sufficiency", () => {
  it.each<[string, ObservationCandidate, RegExp]>([
    [
      "a title without identifiers",
      candidate({}, { type: AffectedResourceType.Unspecified }),
      /no identifiers/,
    ],
    [
      "a CWE alone",
      candidate({ cwe: ["CWE-79"] }, code("src/a.ts", 1)),
      /more specific than a CWE/,
    ],
    [
      "a resource without its minimum fields",
      candidate({ zap: ["10021"] }, { type: AffectedResourceType.WebEndpoint, path: "/" }),
      /webEndpoint resource lacks identity fields \(host\)/,
    ],
  ])("abstains on %s", async (_case, input, explanation) => {
    const [result] = await match(
      [finding("titled", {}, { type: AffectedResourceType.Unspecified })],
      [input],
    );
    expect(result).toMatchObject({ status: "unresolved", reason: "insufficient_evidence" });
    expect(result.explanation).toMatch(explanation);
  });

  it("seeds an asset-level finding from an unspecified resource with a specific weakness", async () => {
    expect(
      await match([], [candidate({ zap: ["10021"] }, { type: AffectedResourceType.Unspecified })]),
    ).toEqual([expect.objectContaining({ status: "new" })]);
  });
});

describe("IdentityFindingMatcher finding source use", () => {
  it("reads the batch asset's findings once per call", async () => {
    const listFindings = vi.fn(async (_assetId: string): Promise<FindingIdentity[]> => []);
    const matcher = new IdentityFindingMatcher({ listFindings });
    await matcher.match(
      assetId,
      [candidate(cve("CVE-2026-1001"), pkg("a")), candidate(cve("CVE-2026-1002"), pkg("b"))],
      logger,
    );
    expect(listFindings).toHaveBeenCalledTimes(1);
    expect(listFindings).toHaveBeenCalledWith(assetId);
  });

  it("propagates source failures instead of returning unresolved decisions", async () => {
    const failure = new Error("findings unavailable");
    const matcher = new IdentityFindingMatcher({
      listFindings: async () => {
        throw failure;
      },
    });
    await expect(
      matcher.match(assetId, [candidate(cve("CVE-2026-1001"), pkg("a"))], logger),
    ).rejects.toBe(failure);
  });

  const valid = finding("valid", cve("CVE-2026-1001"), pkg("a"));
  it.each<[string, FindingIdentity[]]>([
    ["finding on another asset", [{ ...valid, assetId: "other" }]],
    ["repeated finding ID", [valid, { ...valid }]],
    [
      "noncanonical weakness identifier",
      [{ ...valid, weakness: { identifiers: { cve: ["cve-2026-1001"] } } }],
    ],
    ["noncanonical fingerprint", [{ ...valid, fingerprints: { semgrep: ["b", "a"] } }]],
    ["unknown status", [{ ...valid, status: "open" as FindingStatus }]],
    ["invalid creation time", [{ ...valid, createdAt: new Date(Number.NaN) }]],
    [
      "invalid affected resource",
      [{ ...valid, affectedResource: { type: "host" } as unknown as FindingAffectedResource }],
    ],
  ])("rejects a response with a %s using a log-safe error", async (_kind, findings) => {
    await expect(match(findings, [candidate(cve("CVE-2026-1001"), pkg("a"))])).rejects.toThrow(
      /^Invalid finding identity response\.$/,
    );
  });

  it("keeps explanations free of identifier values and leaves candidates untouched", async () => {
    const inputs = [
      candidate(cve("CVE-2026-1001"), pkg("openssl", lockfile, "3.3.1")),
      candidate(xss, code("src/search.ts", 52, "9c1f"), { semgrep: ["9c1f"] }),
    ];
    const snapshot = structuredClone(inputs);
    const results = await match(
      [
        finding("openssl", cve("CVE-2026-1001"), pkg("openssl", lockfile)),
        finding("search", xss, code("src/search.ts", 40), { fingerprints: { semgrep: ["9c1f"] } }),
      ],
      inputs,
    );

    for (const result of results) {
      expect(result.explanation).not.toMatch(/CVE-|openssl|lock|search|9c1f|CWE-/);
    }
    expect(inputs).toStrictEqual(snapshot);
  });
});
