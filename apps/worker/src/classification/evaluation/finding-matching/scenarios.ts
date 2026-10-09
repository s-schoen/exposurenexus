import { toFindingAffectedResource } from "@exposurenexus/backend/findings";
import { AffectedResourceType } from "@exposurenexus/contracts/model/affected-resource";
import {
  AssetEnvironment,
  AssetIdentifierType,
  AssetLifecycleState,
  AssetType,
} from "@exposurenexus/contracts/model/asset";
import { FindingStatus } from "@exposurenexus/contracts/model/finding";
import { VulnerabilitySeverity } from "@exposurenexus/contracts/model/vulnerability";

import type { ObservationCandidate } from "../../classifier.js";
import type {
  EvaluationObservation,
  FindingDataset,
  FindingRecord,
  FindingScenario,
} from "./evaluate.js";
import type { ObservationAffectedResource } from "@exposurenexus/contracts/model/affected-resource";
import type { Asset } from "@exposurenexus/contracts/model/asset";
import type { Weakness } from "@exposurenexus/contracts/model/weakness";

// Hand-authored matcher inputs, not copied scanner records or normalizer replays.
// Field provenance: ../../normalizers/trivy.ts (package resources, cve/trivy identifiers,
// empty fingerprints because Trivy's Fingerprint hashes the rebuilt artifact),
// ../../normalizers/semgrep.ts (source locations, semgrep/cwe identifiers, and
// fingerprints.semgrep mirrored into locationFingerprint), ../../normalizers/bearer.ts
// (one-line spans with columns, bearer/cwe identifiers, no stable fingerprint), and
// ../../normalizers/checkov.ts (block lines, checkov identifiers, the resource as symbol).
// Existing findings are projections of the candidate that first reported them, the way
// pipeline seeding is expected to work; manual findings are authored directly.
// Identifiers and fingerprints are canonical under backend findings rules. Labels follow
// finding-matcher.ts: identity decides, status and origin never exclude a finding, and
// title similarity alone is insufficient evidence.

const author = "90000000-0000-4000-8000-000000000001";
const ingestion = "50000000-0000-4000-8000-000000000001";
const seenAt = new Date("2026-03-01T08:00:00.000Z");

function uuid(prefix: number, key: number) {
  return `${prefix}0000000-0000-4000-8000-${key.toString().padStart(12, "0")}`;
}

function asset(key: number, displayName: string, type: AssetType, value: string): Asset {
  return {
    id: uuid(1, key),
    displayName,
    type,
    environment: AssetEnvironment.Production,
    lifecycleState: AssetLifecycleState.Active,
    ownerId: null,
    identifiers: [
      {
        id: uuid(2, key),
        type:
          type === AssetType.ContainerImage
            ? AssetIdentifierType.OciImageName
            : AssetIdentifierType.VcsRepository,
        namespace: null,
        value,
      },
    ],
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    createdBy: author,
    updatedBy: author,
  };
}

function candidate(
  source: string,
  sourceRecord: string,
  title: string,
  weakness: Weakness,
  affectedResource: ObservationAffectedResource,
  fields: Partial<ObservationCandidate> = {},
): ObservationCandidate {
  return {
    source,
    sourceRecord,
    title,
    description: null,
    remediation: null,
    evidence: null,
    severity: VulnerabilitySeverity.High,
    weakness,
    affectedResource,
    observedAt: null,
    assetIdentifierCandidates: [],
    fingerprints: {},
    sourceMetadata: {},
    ...fields,
  };
}

/** A Trivy package vulnerability as the Trivy normalizer emits it. */
function trivy(
  sourceRecord: string,
  cve: string,
  name: string,
  version: string,
  installationPath?: string,
  ecosystem = "npm",
) {
  return candidate(
    "trivy",
    sourceRecord,
    `${name}: ${cve}`,
    { identifiers: { cve: [cve], trivy: [cve] } },
    {
      type: AffectedResourceType.Package,
      ecosystem,
      name,
      version,
      ...(installationPath === undefined ? {} : { installationPath }),
    },
  );
}

/** A Semgrep match as the Semgrep normalizer emits it. */
function semgrep(
  sourceRecord: string,
  rule: string,
  cwe: string,
  file: string,
  startLine: number,
  fingerprint: string,
) {
  return candidate(
    "semgrep",
    sourceRecord,
    rule,
    { identifiers: { cwe: [cwe], semgrep: [rule] } },
    {
      type: AffectedResourceType.SourceCode,
      file,
      location: { startLine },
      locationFingerprint: fingerprint,
    },
    { fingerprints: { semgrep: [fingerprint] } },
  );
}

/** A Bearer result as the Bearer normalizer emits it, without a stable fingerprint. */
function bearer(
  sourceRecord: string,
  rule: string,
  cwe: string,
  file: string,
  startLine: number,
  startColumn: number,
  endColumn: number,
) {
  return candidate(
    "bearer",
    sourceRecord,
    rule,
    { identifiers: { bearer: [rule], cwe: [cwe] } },
    {
      type: AffectedResourceType.SourceCode,
      file,
      location: { startLine, startColumn, endLine: startLine, endColumn },
    },
  );
}

/** A Checkov result as the Checkov normalizer emits it, with its resource as the symbol. */
function checkov(
  sourceRecord: string,
  check: string,
  file: string,
  symbol: string,
  startLine: number,
  endLine: number,
) {
  return candidate(
    "checkov",
    sourceRecord,
    check,
    { identifiers: { checkov: [check] } },
    { type: AffectedResourceType.SourceCode, file, symbol, location: { startLine, endLine } },
  );
}

function finding(
  key: number,
  owner: Asset,
  status: FindingStatus,
  fields: Pick<FindingRecord, "title" | "weakness" | "affectedResource">,
): FindingRecord {
  return {
    id: uuid(3, key),
    assetId: owner.id,
    severity: VulnerabilitySeverity.High,
    status,
    assigneeId: null,
    dueDate: null,
    mitigation: null,
    createdAt: seenAt,
    updatedAt: seenAt,
    createdBy: author,
    updatedBy: author,
    ...fields,
  };
}

/** A finding seeded from a scanner candidate, with that candidate as its only observation. */
function seeded(
  key: number,
  owner: Asset,
  status: FindingStatus,
  source: ObservationCandidate,
): { finding: FindingRecord; observation: EvaluationObservation } {
  const record = finding(key, owner, status, {
    title: source.title,
    weakness: source.weakness,
    affectedResource: toFindingAffectedResource(source.affectedResource),
  });
  return { finding: record, observation: observation(key, record, source) };
}

function observation(
  key: number,
  target: FindingRecord,
  source: ObservationCandidate,
  manual = false,
): EvaluationObservation {
  return {
    id: uuid(4, key),
    findingId: target.id,
    title: source.title,
    description: source.description,
    evidence: source.evidence,
    remediation: source.remediation,
    severity: source.severity,
    weakness: source.weakness,
    affectedResource: source.affectedResource,
    fingerprints: manual ? {} : source.fingerprints,
    observedAt: seenAt,
    createdAt: seenAt,
    updatedAt: seenAt,
    createdBy: author,
    updatedBy: author,
    source: manual ? "manual" : source.source,
    ingestionId: manual ? null : ingestion,
  };
}

const billingImage = asset(
  1,
  "Billing API image",
  AssetType.ContainerImage,
  "registry.example.test/billing/api",
);
const ledgerImage = asset(
  2,
  "Ledger image",
  AssetType.ContainerImage,
  "registry.example.test/billing/ledger",
);

const lockfile = "app/package-lock.json";
const openssl = seeded(
  11,
  billingImage,
  FindingStatus.Active,
  trivy("Results[0]/Vulnerabilities[0]", "CVE-2026-1001", "openssl", "3.3.1-r0", undefined, "apk"),
);
const terminal = (
  [
    [12, FindingStatus.Mitigated, "CVE-2026-1002", "express"],
    [13, FindingStatus.FalsePositive, "CVE-2026-1003", "body-parser"],
    [14, FindingStatus.RiskAccepted, "CVE-2026-1004", "cookie"],
    [15, FindingStatus.Inactive, "CVE-2026-1005", "qs"],
    [16, FindingStatus.OutOfScope, "CVE-2026-1006", "send"],
  ] as const
).map(([key, status, cve, name]) => ({
  status,
  cve,
  name,
  ...seeded(
    key,
    billingImage,
    status,
    trivy(`Results[1]/Vulnerabilities[${key}]`, cve, name, "1.0.0", lockfile),
  ),
}));
const lodashSource = trivy(
  "Results[1]/Vulnerabilities[0]",
  "CVE-2026-1007",
  "lodash",
  "4.17.20",
  lockfile,
);
const lodashCanonical = seeded(17, billingImage, FindingStatus.Confirmed, lodashSource);
// An analyst marked a second import of the same identity as a duplicate of the first.
const lodashDuplicate = seeded(18, billingImage, FindingStatus.Duplicate, lodashSource);
const minimistRoot = seeded(
  19,
  billingImage,
  FindingStatus.Active,
  trivy(
    "Results[2]/Vulnerabilities[0]",
    "CVE-2026-1009",
    "minimist",
    "1.2.5",
    "app/node_modules/minimist/package.json",
  ),
);
const minimistNested = seeded(
  20,
  billingImage,
  FindingStatus.Active,
  trivy(
    "Results[3]/Vulnerabilities[0]",
    "CVE-2026-1009",
    "minimist",
    "1.2.5",
    "app/node_modules/mkdirp/node_modules/minimist/package.json",
  ),
);
const ledgerOpenssl = seeded(
  21,
  ledgerImage,
  FindingStatus.Active,
  trivy("Results[0]/Vulnerabilities[1]", "CVE-2026-1011", "openssl", "3.3.1-r0", undefined, "apk"),
);

const imageExisting = [
  openssl,
  ...terminal,
  lodashCanonical,
  lodashDuplicate,
  minimistRoot,
  minimistNested,
  ledgerOpenssl,
];

const containerPackages: FindingScenario = {
  id: "container-packages",
  assets: [billingImage, ledgerImage],
  findings: imageExisting.map((entry) => entry.finding),
  observations: imageExisting.map((entry) => entry.observation),
  cases: [
    {
      id: "rescan-after-triage",
      assetId: billingImage.id,
      note: "Status records workflow, not identity: every status stays eligible.",
      candidates: [
        {
          id: "active-version-drift",
          // Version is observation-only; an upgraded but still vulnerable package is the same finding.
          candidate: trivy(
            "Results[0]/Vulnerabilities[0]",
            "CVE-2026-1001",
            "openssl",
            "3.3.2-r0",
            undefined,
            "apk",
          ),
          expected: { status: "matched", findingIds: [openssl.finding.id] },
          tags: ["status:active", "drift:version"],
        },
        ...terminal.map((entry) => ({
          id: `${entry.status.replaceAll("_", "-")}-recurs`,
          candidate: trivy(
            `Results[1]/Vulnerabilities[${entry.finding.id.slice(-2)}]`,
            entry.cve,
            entry.name,
            "1.0.0",
            lockfile,
          ),
          expected: { status: "matched" as const, findingIds: [entry.finding.id] },
          tags: [`status:${entry.status}`],
        })),
      ],
    },
    {
      id: "siblings-form-one-group",
      assetId: billingImage.id,
      note:
        "Trivy repeats a vulnerability when two analyzers detect the same package. Both " +
        "records seed one new finding; a different CVE on that package seeds another.",
      candidates: [
        {
          id: "semver-first-analyzer",
          candidate: trivy(
            "Results[1]/Vulnerabilities[7]",
            "CVE-2026-1020",
            "semver",
            "7.5.1",
            lockfile,
          ),
          expected: { status: "new", group: "semver-1020" },
          tags: ["partition:siblings"],
        },
        {
          id: "semver-second-analyzer",
          candidate: trivy(
            "Results[4]/Vulnerabilities[2]",
            "CVE-2026-1020",
            "semver",
            "7.5.1",
            lockfile,
          ),
          expected: { status: "new", group: "semver-1020" },
          tags: ["partition:siblings"],
        },
        {
          id: "semver-other-cve",
          candidate: trivy(
            "Results[1]/Vulnerabilities[8]",
            "CVE-2026-1021",
            "semver",
            "7.5.1",
            lockfile,
          ),
          expected: { status: "new", group: "semver-1021" },
          tags: ["partition:separate"],
        },
        {
          id: "existing-openssl",
          candidate: trivy(
            "Results[0]/Vulnerabilities[0]",
            "CVE-2026-1001",
            "openssl",
            "3.3.1-r0",
            undefined,
            "apk",
          ),
          expected: { status: "matched", findingIds: [openssl.finding.id] },
          tags: ["status:active"],
        },
      ],
    },
    {
      id: "existing-finding-reported-twice",
      assetId: billingImage.id,
      note: "Several candidates may match one existing finding instead of seeding a new one.",
      candidates: [
        {
          id: "first-analyzer",
          candidate: trivy(
            "Results[1]/Vulnerabilities[12]",
            "CVE-2026-1002",
            "express",
            "1.0.0",
            lockfile,
          ),
          expected: { status: "matched", findingIds: [terminal[0].finding.id] },
          tags: ["status:mitigated", "partition:siblings"],
        },
        {
          id: "second-analyzer",
          candidate: trivy(
            "Results[4]/Vulnerabilities[0]",
            "CVE-2026-1002",
            "express",
            "1.0.0",
            lockfile,
          ),
          expected: { status: "matched", findingIds: [terminal[0].finding.id] },
          tags: ["status:mitigated", "partition:siblings"],
        },
      ],
    },
    {
      id: "duplicate-and-canonical",
      assetId: billingImage.id,
      note:
        "A duplicate finding shares its canonical finding's identity. Either target is " +
        "correct; ambiguous would drop this observation on every re-scan.",
      candidates: [
        {
          id: "lodash",
          candidate: lodashSource,
          expected: {
            status: "matched",
            findingIds: [lodashCanonical.finding.id, lodashDuplicate.finding.id],
          },
          tags: ["status:duplicate"],
        },
      ],
    },
    {
      id: "partial-package-identity",
      assetId: billingImage.id,
      note:
        "Without an installation path the vulnerable minimist could be either installed " +
        "copy, and neither identity evidence nor status breaks the tie.",
      candidates: [
        {
          id: "minimist-without-path",
          candidate: trivy("Results[2]/Vulnerabilities[0]", "CVE-2026-1009", "minimist", "1.2.5"),
          expected: { status: "unresolved", reason: "ambiguous" },
          tags: ["evidence:partial"],
        },
      ],
    },
    {
      id: "identity-on-other-asset",
      assetId: ledgerImage.id,
      note:
        "Finding identity never spans assets: billing's openssl finding is invisible here, " +
        "while ledger's own openssl finding still matches.",
      candidates: [
        {
          id: "billing-identity",
          candidate: trivy(
            "Results[0]/Vulnerabilities[0]",
            "CVE-2026-1001",
            "openssl",
            "3.3.1-r0",
            undefined,
            "apk",
          ),
          expected: { status: "new", group: "openssl-1001" },
          tags: ["cross-asset"],
        },
        {
          id: "ledger-identity",
          candidate: trivy(
            "Results[0]/Vulnerabilities[1]",
            "CVE-2026-1011",
            "openssl",
            "3.3.1-r0",
            undefined,
            "apk",
          ),
          expected: { status: "matched", findingIds: [ledgerOpenssl.finding.id] },
          tags: ["status:active"],
        },
      ],
    },
  ],
};

const checkoutRepository = asset(
  3,
  "Checkout service",
  AssetType.Software,
  "git.example.test/shop/checkout",
);

const xssRule = "javascript.express.security.audit.xss.direct-response-write";
const searchXss = seeded(
  31,
  checkoutRepository,
  FindingStatus.Active,
  semgrep("results[0]", xssRule, "CWE-79", "src/routes/search.ts", 40, "9c1f2e7a4b6d"),
);
const profileXss = seeded(
  32,
  checkoutRepository,
  FindingStatus.Active,
  semgrep("results[1]", xssRule, "CWE-79", "src/routes/profile.ts", 18, "5e0d3a91c7f2"),
);
// A pentester reported this before scanning existed; no observation backs the finding.
const manualInjection = finding(33, checkoutRepository, FindingStatus.Confirmed, {
  title: "SQL injection in order lookup",
  weakness: { identifiers: { cwe: ["CWE-89"] } },
  affectedResource: {
    type: AffectedResourceType.SourceCode,
    file: "src/orders/lookup.ts",
    location: { startLine: 27 },
  },
});
// An operator transcribed a Semgrep report by hand, with a manual observation.
const secretRule = "generic.secrets.security.detected-generic-secret";
const manualSecretSource = semgrep(
  "results[2]",
  secretRule,
  "CWE-798",
  "config/payment.ts",
  5,
  "77ab01c3e9d4",
);
const manualSecret = finding(34, checkoutRepository, FindingStatus.Active, {
  title: "Hard-coded payment gateway secret",
  weakness: manualSecretSource.weakness,
  affectedResource: toFindingAffectedResource(manualSecretSource.affectedResource),
});

const sourceCode: FindingScenario = {
  id: "source-code",
  assets: [checkoutRepository],
  findings: [searchXss.finding, profileXss.finding, manualInjection, manualSecret],
  observations: [
    searchXss.observation,
    profileXss.observation,
    observation(34, manualSecret, manualSecretSource, true),
  ],
  cases: [
    {
      id: "code-moved",
      assetId: checkoutRepository.id,
      note: "Semgrep fingerprints hash rule, path, and matched code, so they survive line shifts.",
      candidates: [
        {
          id: "search-xss-shifted",
          candidate: semgrep(
            "results[0]",
            xssRule,
            "CWE-79",
            "src/routes/search.ts",
            52,
            "9c1f2e7a4b6d",
          ),
          expected: { status: "matched", findingIds: [searchXss.finding.id] },
          tags: ["drift:line", "evidence:fingerprint"],
        },
        {
          id: "profile-xss-unchanged",
          candidate: semgrep(
            "results[1]",
            xssRule,
            "CWE-79",
            "src/routes/profile.ts",
            18,
            "5e0d3a91c7f2",
          ),
          expected: { status: "matched", findingIds: [profileXss.finding.id] },
          tags: ["evidence:fingerprint"],
        },
      ],
    },
    {
      id: "manual-findings",
      assetId: checkoutRepository.id,
      note:
        "Manually created findings are eligible. The transcribed secret shares rule, file, " +
        "and location fingerprint; the injection shares CWE, file, and line with a finding " +
        "that has no observation. A rule in a file no finding covers is new.",
      candidates: [
        {
          id: "transcribed-secret",
          candidate: manualSecretSource,
          expected: { status: "matched", findingIds: [manualSecret.id] },
          tags: ["origin:manual"],
        },
        {
          id: "pentest-injection",
          candidate: semgrep(
            "results[3]",
            "javascript.sequelize.security.audit.sequelize-injection-express",
            "CWE-89",
            "src/orders/lookup.ts",
            27,
            "d41c8e5f0a92",
          ),
          expected: { status: "matched", findingIds: [manualInjection.id] },
          tags: ["origin:manual", "evidence:no-observation"],
        },
        {
          id: "new-open-redirect",
          candidate: semgrep(
            "results[4]",
            "javascript.express.security.audit.express-open-redirect",
            "CWE-601",
            "src/routes/return.ts",
            12,
            "1b7e4d0c93fa",
          ),
          expected: { status: "new", group: "open-redirect" },
        },
      ],
    },
    {
      id: "weak-and-conflicting-evidence",
      assetId: checkoutRepository.id,
      note:
        "A copied title is not identity. A fingerprint from another namespace is not " +
        "evidence. A Semgrep fingerprint naming one finding while rule, file, and line " +
        "name another is a conflict, not a tie to break.",
      candidates: [
        {
          id: "title-only",
          candidate: candidate(
            "sarif",
            "runs[0]/results[0]",
            xssRule,
            { identifiers: {} },
            { type: AffectedResourceType.Unspecified },
          ),
          expected: { status: "unresolved", reason: "insufficient_evidence" },
          tags: ["evidence:title-only"],
        },
        {
          id: "foreign-fingerprint-namespace",
          candidate: candidate(
            "sarif",
            "runs[0]/results[1]",
            "Weak hash",
            { identifiers: { cwe: ["CWE-328"], sarif: ["weak-hash"] } },
            {
              type: AffectedResourceType.SourceCode,
              file: "src/auth/tokens.ts",
              location: { startLine: 9 },
            },
            { fingerprints: { sarif: ["5e0d3a91c7f2"] } },
          ),
          expected: { status: "new", group: "weak-hash" },
          tags: ["evidence:fingerprint-namespace"],
        },
        {
          id: "fingerprint-contradicts-location",
          candidate: semgrep(
            "results[1]",
            xssRule,
            "CWE-79",
            "src/routes/profile.ts",
            18,
            "9c1f2e7a4b6d",
          ),
          expected: { status: "unresolved", reason: "conflicting_evidence" },
          tags: ["evidence:conflict"],
        },
      ],
    },
  ],
};

const storefront = asset(
  4,
  "Storefront monorepo",
  AssetType.Software,
  "git.example.test/shop/storefront",
);

const loggerLeak = "javascript_lang_logger_leak";
const weakHash = "javascript_lang_weak_hash_md5";
const openRedirect = "javascript_express_open_redirect";
const leak = (record: number, file: string, line: number, start: number, end: number) =>
  bearer(`findings[${record}]`, loggerLeak, "CWE-532", file, line, start, end);
const redirect = (record: number, line: number, start: number, end: number) =>
  bearer(`findings[${record}]`, openRedirect, "CWE-601", "routes/redirect.ts", line, start, end);
const s3Logging = (startLine: number, endLine: number) =>
  checkov(
    "results.failed_checks[0]",
    "CKV_AWS_18",
    "terraform/s3.tf",
    "aws_s3_bucket.logs",
    startLine,
    endLine,
  );
const basketXss = (record: number, startLine: number, fingerprint: string) =>
  semgrep(`results[${record}]`, xssRule, "CWE-79", "routes/basket.ts", startLine, fingerprint);

const leakStartup = seeded(41, storefront, FindingStatus.Active, leak(0, "server.ts", 10, 5, 40));
const leakRoutes = seeded(42, storefront, FindingStatus.Active, leak(1, "server.ts", 25, 9, 30));
const leakShutdown = seeded(43, storefront, FindingStatus.Active, leak(2, "server.ts", 40, 5, 61));
const hashUtils = seeded(
  44,
  storefront,
  FindingStatus.Active,
  bearer("findings[3]", weakHash, "CWE-328", "lib/utils.ts", 20, 3, 50),
);
const redirectKept = seeded(45, storefront, FindingStatus.Active, redirect(4, 12, 5, 40));
const redirectFixed = seeded(46, storefront, FindingStatus.Active, redirect(5, 30, 7, 22));
const leakInsecurity = seeded(
  47,
  storefront,
  FindingStatus.Active,
  leak(6, "lib/insecurity.ts", 20, 5, 40),
);
const leakLogin = seeded(
  48,
  storefront,
  FindingStatus.Active,
  leak(7, "routes/login.ts", 15, 5, 40),
);
const logsBucket = seeded(49, storefront, FindingStatus.Active, s3Logging(10, 20));
const basketFirst = seeded(50, storefront, FindingStatus.Active, basketXss(0, 10, "a1c4e7f20b38"));
const basketSecond = seeded(51, storefront, FindingStatus.Active, basketXss(1, 30, "b2d5f8a31c49"));

const driftExisting = [
  leakStartup,
  leakRoutes,
  leakShutdown,
  hashUtils,
  redirectKept,
  redirectFixed,
  leakInsecurity,
  leakLogin,
  logsBucket,
  basketFirst,
  basketSecond,
];
const paired = ["drift:line", "evidence:drift-pairing"];

const sourceDrift: FindingScenario = {
  id: "source-drift",
  assets: [storefront],
  findings: driftExisting.map((entry) => entry.finding),
  observations: driftExisting.map((entry) => entry.observation),
  cases: [
    {
      id: "shifted-together",
      assetId: storefront.id,
      note:
        "Bearer reports no stable fingerprint. Results of one rule in one file that shift " +
        "together pair in file order by span shape; a lone result whose indentation changed " +
        "pairs by equal width.",
      candidates: [
        {
          id: "leak-startup-shifted",
          candidate: leak(0, "server.ts", 16, 5, 40),
          expected: { status: "matched", findingIds: [leakStartup.finding.id] },
          tags: paired,
        },
        {
          id: "leak-shutdown-shifted",
          candidate: leak(2, "server.ts", 46, 5, 61),
          expected: { status: "matched", findingIds: [leakShutdown.finding.id] },
          tags: paired,
        },
        {
          id: "leak-routes-shifted",
          candidate: leak(1, "server.ts", 31, 9, 30),
          expected: { status: "matched", findingIds: [leakRoutes.finding.id] },
          tags: paired,
        },
        {
          id: "hash-reindented",
          candidate: bearer("findings[3]", weakHash, "CWE-328", "lib/utils.ts", 21, 5, 52),
          expected: { status: "matched", findingIds: [hashUtils.finding.id] },
          tags: paired,
        },
      ],
    },
    {
      id: "fixed-and-introduced",
      assetId: storefront.id,
      note:
        "One open redirect was fixed and another introduced in the same file. Their spans " +
        "differ, so no pair forms, and the new result is ambiguous while the fixed finding " +
        "stays unpaired.",
      candidates: [
        {
          id: "redirect-kept",
          candidate: redirect(4, 12, 5, 40),
          expected: { status: "matched", findingIds: [redirectKept.finding.id] },
        },
        {
          id: "redirect-introduced",
          candidate: redirect(5, 44, 3, 58),
          expected: { status: "unresolved", reason: "ambiguous" },
          tags: ["evidence:drift-pairing"],
        },
      ],
    },
    {
      id: "leftovers",
      assetId: storefront.id,
      note:
        "A leftover result seeds a new finding only once every finding of its rule in its " +
        "file is paired. Two results competing for one unpaired finding are both ambiguous.",
      candidates: [
        {
          id: "insecurity-shifted",
          candidate: leak(6, "lib/insecurity.ts", 23, 5, 40),
          expected: { status: "matched", findingIds: [leakInsecurity.finding.id] },
          tags: paired,
        },
        {
          id: "insecurity-introduced",
          candidate: leak(8, "lib/insecurity.ts", 50, 3, 18),
          expected: { status: "new", group: "insecurity-leak" },
          tags: ["evidence:drift-pairing"],
        },
        {
          id: "login-first",
          candidate: leak(7, "routes/login.ts", 18, 9, 30),
          expected: { status: "unresolved", reason: "ambiguous" },
          tags: ["evidence:drift-pairing"],
        },
        {
          id: "login-second",
          candidate: leak(9, "routes/login.ts", 40, 3, 18),
          expected: { status: "unresolved", reason: "ambiguous" },
          tags: ["evidence:drift-pairing"],
        },
      ],
    },
    {
      id: "iac-block-resized",
      assetId: storefront.id,
      note:
        "Checkov reports a resource's block lines. The block grew and moved; the shared " +
        "resource symbol anchors the pair although the span shape changed.",
      candidates: [
        {
          id: "logs-bucket-resized",
          candidate: s3Logging(14, 27),
          expected: { status: "matched", findingIds: [logsBucket.finding.id] },
          tags: paired,
        },
      ],
    },
    {
      id: "fingerprint-conflict",
      assetId: storefront.id,
      note:
        "A Semgrep fingerprint names one finding while rule, file, and line name the other: " +
        "a conflict. Drift pairing never overrides it, and findings the conflict reached " +
        "cannot pair with a new result in the same file.",
      candidates: [
        {
          id: "basket-conflict",
          candidate: basketXss(1, 30, "a1c4e7f20b38"),
          expected: { status: "unresolved", reason: "conflicting_evidence" },
          tags: ["evidence:conflict"],
        },
        {
          id: "basket-introduced",
          candidate: basketXss(2, 52, "c3e6a9b42d5f"),
          expected: { status: "new", group: "basket-xss" },
          tags: ["evidence:drift-pairing"],
        },
      ],
    },
  ],
};

export const dataset: FindingDataset = {
  id: "finding-matching-v1",
  scenarios: [containerPackages, sourceCode, sourceDrift],
};
