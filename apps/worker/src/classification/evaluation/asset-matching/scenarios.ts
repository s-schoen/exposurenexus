import {
  AffectedResourceType,
  WebEndpointComponentKind,
} from "@exposurenexus/contracts/model/affected-resource";
import {
  AssetEnvironment,
  AssetIdentifierType,
  AssetLifecycleState,
  AssetType,
} from "@exposurenexus/contracts/model/asset";
import { VulnerabilitySeverity } from "@exposurenexus/contracts/model/vulnerability";

import type { ObservationCandidate } from "../../classifier.js";
import type { EvaluationDataset, InventoryScenario } from "./evaluate.js";
import type { Asset, AssetIdentifier } from "@exposurenexus/contracts/model/asset";

// Hand-authored matcher inputs, not copied scanner records or normalizer replays.
// Field provenance: ../../normalizers/nuclei.ts (normalizeRecord/mapSubject),
// nuclei.test.ts (subject IP attribution and redirects), semgrep.ts and
// semgrep.test.ts (source locations and empty identifiers), trivy.ts and
// trivy-packages.test.ts (package resources and report provenance), checkov.ts
// and checkov.test.ts (IaC locations, symbols, and empty identifiers).
// Explicit repository, container, cloud, and namespace enrichments below exercise
// the existing contracts/model/affected-resource.ts and asset-matcher.ts boundary;
// they do not claim that today's normalizers produce those enriched fields.
// All identifier values are already canonical under backend inventory/identifiers:
// DNS is lowercase, IPs are bare, VCS has no scheme/.git, OCI has no tag/digest,
// and cloud IDs plus namespaces preserve case. Null namespace is global, not '*'.

function identifier(
  type: AssetIdentifierType,
  value: string,
  namespace: string | null = null,
): AssetIdentifier {
  return { type, namespace, value };
}

function asset(
  key: number,
  displayName: string,
  type: AssetType,
  identifiers: AssetIdentifier[],
  fields: Partial<Pick<Asset, "environment" | "lifecycleState">> = {},
): Asset {
  return {
    id: `10000000-0000-4000-8000-${key.toString().padStart(12, "0")}`,
    displayName,
    type,
    environment: AssetEnvironment.Unknown,
    lifecycleState: AssetLifecycleState.Active,
    ownerId: null,
    identifiers: identifiers.map((value, index) => ({
      ...value,
      id: `20000000-0000-4000-8000-${(key * 100 + index + 1).toString().padStart(12, "0")}`,
    })),
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    createdBy: "90000000-0000-4000-8000-000000000001",
    updatedBy: "90000000-0000-4000-8000-000000000001",
    ...fields,
  };
}

function candidate(
  source: string,
  sourceRecord: string,
  ruleId: string,
  fields: Partial<Omit<ObservationCandidate, "source" | "sourceRecord">>,
): ObservationCandidate {
  return {
    source,
    sourceRecord,
    title: ruleId,
    description: null,
    remediation: null,
    evidence: null,
    severity: VulnerabilitySeverity.Medium,
    weakness: { identifiers: { [source]: [ruleId] } },
    affectedResource: { type: AffectedResourceType.Unspecified },
    observedAt: null,
    assetIdentifierCandidates: [],
    fingerprints: {},
    sourceMetadata: {},
    ...fields,
  };
}

const portal = asset(101, "Harbor portal", AssetType.Host, [
  identifier(AssetIdentifierType.DnsName, "portal.example.test"),
  identifier(AssetIdentifierType.IpAddress, "192.0.2.10"),
]);
const gateway = asset(102, "Harbor gateway", AssetType.Host, [
  identifier(AssetIdentifierType.DnsName, "gateway.example.test"),
  identifier(AssetIdentifierType.IpAddress, "198.51.100.20"),
]);
const legacyPortal = asset(
  103,
  "Harbor portal legacy",
  AssetType.Host,
  [
    identifier(AssetIdentifierType.DnsName, "legacy.example.test"),
    identifier(AssetIdentifierType.IpAddress, "2001:db8::30"),
  ],
  { lifecycleState: AssetLifecycleState.Archived },
);
const stagingPortal = asset(
  104,
  "Harbor portal",
  AssetType.Host,
  [
    identifier(AssetIdentifierType.DnsName, "portal-staging.example.test"),
    identifier(AssetIdentifierType.IpAddress, "192.0.2.40"),
  ],
  { environment: AssetEnvironment.Staging },
);
const labPortal = asset(105, "Harbor portal lab", AssetType.Host, [
  identifier(AssetIdentifierType.DnsName, "portal.lab.example.test"),
  identifier(AssetIdentifierType.IpAddress, "192.0.2.50"),
]);

const network: InventoryScenario = {
  id: "network",
  assets: [portal, gateway, legacyPortal, stagingPortal, labPortal],
  cases: [
    {
      id: "dns-and-ip-agree",
      candidate: candidate("nuclei", "line:1", "http-security-headers", {
        affectedResource: {
          type: AffectedResourceType.WebEndpoint,
          scheme: "https",
          host: "portal.example.test",
          port: 443,
          path: "/health",
          component: { kind: WebEndpointComponentKind.Endpoint },
        },
        observedAt: new Date("2026-02-01T12:00:00.000Z"),
        assetIdentifierCandidates: [
          identifier(AssetIdentifierType.DnsName, "portal.example.test"),
          identifier(AssetIdentifierType.IpAddress, "192.0.2.10"),
        ],
        sourceMetadata: {
          type: "http",
          host: "portal.example.test",
          ip: "192.0.2.10",
          "matched-at": "https://portal.example.test/health",
          timestamp: "2026-02-01T12:00:00Z",
        },
      }),
      expected: { status: "matched", assetId: portal.id },
    },
    {
      id: "known-dns-with-unregistered-ip",
      // A newly reported address is not an inventory conflict or an instruction to add it.
      candidate: candidate("nuclei", "line:2", "http-security-headers", {
        affectedResource: {
          type: AffectedResourceType.WebEndpoint,
          scheme: "https",
          host: "portal.example.test",
          port: 443,
          path: "/health",
          component: { kind: WebEndpointComponentKind.Endpoint },
        },
        assetIdentifierCandidates: [
          identifier(AssetIdentifierType.DnsName, "portal.example.test"),
          identifier(AssetIdentifierType.IpAddress, "192.0.2.99"),
        ],
        sourceMetadata: {
          type: "http",
          host: "portal.example.test",
          ip: "192.0.2.99",
          "matched-at": "https://portal.example.test/health",
        },
      }),
      expected: { status: "matched", assetId: portal.id },
    },
    {
      id: "known-dns-and-ip-conflict",
      candidate: candidate("nuclei", "line:3", "http-security-headers", {
        affectedResource: {
          type: AffectedResourceType.WebEndpoint,
          host: "portal.example.test",
          component: { kind: WebEndpointComponentKind.Endpoint },
        },
        assetIdentifierCandidates: [
          identifier(AssetIdentifierType.DnsName, "portal.example.test"),
          identifier(AssetIdentifierType.IpAddress, "198.51.100.20"),
        ],
        sourceMetadata: {
          type: "http",
          host: "portal.example.test",
          ip: "198.51.100.20",
        },
      }),
      expected: { status: "unresolved", reason: "conflicting_identifiers" },
    },
    {
      id: "known-target-over-original-request-context",
      // Nuclei retains the pre-redirect host/IP as metadata, not subject identifiers.
      // The contract permits abstention; this clear post-redirect fixture rewards a match.
      candidate: candidate("nuclei", "line:4", "http-security-headers", {
        affectedResource: {
          type: AffectedResourceType.WebEndpoint,
          scheme: "https",
          host: "gateway.example.test",
          port: 443,
          path: "/signin",
          component: { kind: WebEndpointComponentKind.Endpoint },
          reportedUrl: "https://gateway.example.test/signin",
        },
        assetIdentifierCandidates: [
          identifier(AssetIdentifierType.DnsName, "gateway.example.test"),
        ],
        sourceMetadata: {
          type: "http",
          host: "portal.example.test",
          url: "https://portal.example.test/",
          ip: "192.0.2.10",
          "matched-at": "https://gateway.example.test/signin",
        },
      }),
      expected: { status: "matched", assetId: gateway.id },
    },
    {
      id: "archived-ipv6-target",
      candidate: candidate("nuclei", "line:5", "tls-version", {
        affectedResource: {
          type: AffectedResourceType.NetworkService,
          host: "[2001:db8::30]",
          port: 443,
          transport: "tcp",
          protocol: "tls",
        },
        assetIdentifierCandidates: [identifier(AssetIdentifierType.IpAddress, "2001:db8::30")],
        sourceMetadata: { type: "ssl", "matched-at": "[2001:db8::30]:443" },
      }),
      expected: { status: "matched", assetId: legacyPortal.id },
    },
    {
      id: "identified-host-absent-from-inventory",
      candidate: candidate("nuclei", "line:6", "http-security-headers", {
        affectedResource: {
          type: AffectedResourceType.WebEndpoint,
          host: "reports.example.test",
          component: { kind: WebEndpointComponentKind.Endpoint },
        },
        assetIdentifierCandidates: [
          identifier(AssetIdentifierType.DnsName, "reports.example.test"),
          identifier(AssetIdentifierType.IpAddress, "203.0.113.77"),
        ],
        sourceMetadata: {
          type: "http",
          host: "reports.example.test",
          ip: "203.0.113.77",
        },
      }),
      expected: { status: "unresolved", reason: "no_match" },
    },
    {
      id: "detection-without-subject-evidence",
      candidate: candidate("nuclei", "line:7", "http-security-headers", {
        sourceMetadata: { type: "offline-http", "template-id": "http-security-headers" },
      }),
      expected: { status: "unresolved", reason: "insufficient_evidence" },
    },
    {
      id: "display-name-is-not-identity",
      // A saved page title resembles two display names but establishes no host identity.
      candidate: candidate("nuclei", "line:8", "page-title", {
        evidence: "Extracted page title: Harbor portal",
        sourceMetadata: {
          type: "offline-http",
          "template-id": "page-title",
          "extracted-results": ["Harbor portal"],
        },
      }),
      expected: { status: "unresolved", reason: "insufficient_evidence" },
    },
    {
      id: "short-hostname-expands-to-one-host",
      // An intranet short name is partial DNS identity. Only one inventory hostname
      // starts with this label; portal-staging is a different label, not a prefix match.
      candidate: candidate("nuclei", "line:9", "http-security-headers", {
        affectedResource: {
          type: AffectedResourceType.WebEndpoint,
          scheme: "http",
          host: "gateway",
          port: 80,
          path: "/",
          component: { kind: WebEndpointComponentKind.Endpoint },
        },
        assetIdentifierCandidates: [identifier(AssetIdentifierType.DnsName, "gateway")],
        sourceMetadata: { type: "http", host: "gateway", "matched-at": "http://gateway/" },
      }),
      expected: { status: "matched", assetId: gateway.id },
    },
    {
      id: "short-hostname-fits-several-hosts",
      // Two inventory hostnames share the first label, so the short name stays ambiguous.
      candidate: candidate("nuclei", "line:10", "http-security-headers", {
        affectedResource: {
          type: AffectedResourceType.WebEndpoint,
          scheme: "http",
          host: "portal",
          port: 80,
          path: "/",
          component: { kind: WebEndpointComponentKind.Endpoint },
        },
        assetIdentifierCandidates: [identifier(AssetIdentifierType.DnsName, "portal")],
        sourceMetadata: { type: "http", host: "portal", "matched-at": "http://portal/" },
      }),
      expected: { status: "unresolved", reason: "ambiguous" },
    },
  ],
};

const beaconRepository = asset(
  201,
  "Beacon service",
  AssetType.Software,
  [identifier(AssetIdentifierType.VcsRepository, "git.example.test/platform/Beacon")],
  { environment: AssetEnvironment.NotApplicable },
);
const lowercaseRepository = asset(
  202,
  "Beacon service",
  AssetType.Software,
  [identifier(AssetIdentifierType.VcsRepository, "git.example.test/platform/beacon")],
  { environment: AssetEnvironment.NotApplicable },
);
const beaconImage = asset(203, "Beacon service", AssetType.ContainerImage, [
  identifier(AssetIdentifierType.OciImageName, "registry.example.test/platform/beacon"),
]);
const mirrorImage = asset(204, "Beacon service mirror", AssetType.ContainerImage, [
  identifier(AssetIdentifierType.OciImageName, "mirror.example.test/platform/beacon"),
]);
const mirrorRepository = asset(
  205,
  "Beacon service mirror",
  AssetType.Software,
  [identifier(AssetIdentifierType.VcsRepository, "mirror.example.test/platform/beacon")],
  { environment: AssetEnvironment.NotApplicable },
);
const lanternImage = asset(206, "Lantern worker", AssetType.ContainerImage, [
  identifier(AssetIdentifierType.OciImageName, "registry.example.test/platform/lantern"),
]);

const repositoriesImages: InventoryScenario = {
  id: "repositories-images",
  assets: [
    beaconRepository,
    lowercaseRepository,
    beaconImage,
    mirrorImage,
    mirrorRepository,
    lanternImage,
  ],
  cases: [
    {
      id: "canonical-repository-identifier",
      candidate: candidate("trivy", "/Results/0/Vulnerabilities/0", "CVE-2025-12345", {
        affectedResource: {
          type: AffectedResourceType.Package,
          ecosystem: "npm",
          name: "route-parser",
          version: "1.2.0",
        },
        assetIdentifierCandidates: [
          identifier(AssetIdentifierType.VcsRepository, "git.example.test/platform/Beacon"),
        ],
        sourceMetadata: {
          provenance: {
            document: {
              ArtifactType: "repository",
              Metadata: { RepoURL: "https://git.example.test/platform/Beacon.git" },
            },
            scanResult: { Target: "package-lock.json", Class: "lang-pkgs", Type: "npm" },
          },
        },
      }),
      expected: { status: "matched", assetId: beaconRepository.id },
    },
    {
      id: "repository-path-case-is-significant",
      candidate: candidate("trivy", "/Results/0/Vulnerabilities/1", "CVE-2025-12345", {
        affectedResource: { type: AffectedResourceType.Package, name: "route-parser" },
        assetIdentifierCandidates: [
          identifier(AssetIdentifierType.VcsRepository, "git.example.test/platform/beacon"),
        ],
        sourceMetadata: {
          provenance: {
            document: {
              ArtifactType: "repository",
              Metadata: { RepoURL: "https://git.example.test/platform/beacon.git" },
            },
          },
        },
      }),
      expected: { status: "matched", assetId: lowercaseRepository.id },
    },
    {
      id: "source-repository-context-without-identifiers",
      // Synthetic trusted repository enrichment of a Semgrep-shaped source location.
      // The repository URL, not the checkout path or display name, establishes identity.
      candidate: candidate("semgrep", "/results/0", "typescript.security.unsafe-redirect", {
        affectedResource: {
          type: AffectedResourceType.SourceCode,
          repository: "https://git.example.test/platform/Beacon.git",
          file: "service/routes/redirect.ts",
          location: { startLine: 24, endLine: 26 },
          revision: "0123456789abcdef0123456789abcdef01234567",
        },
        sourceMetadata: {
          provenance: {
            result: { path: "service/routes/redirect.ts", start: { line: 24 }, end: { line: 26 } },
          },
        },
      }),
      expected: { status: "matched", assetId: beaconRepository.id },
    },
    {
      id: "source-path-without-repository",
      // Semgrep does not derive a repository from checkout directories or rule references.
      candidate: candidate("semgrep", "/results/1", "typescript.security.unsafe-redirect", {
        affectedResource: {
          type: AffectedResourceType.SourceCode,
          file: "beacon/service/routes/redirect.ts",
          location: { startLine: 24, endLine: 26 },
        },
        sourceMetadata: {
          provenance: { result: { path: "beacon/service/routes/redirect.ts" } },
        },
      }),
      expected: { status: "unresolved", reason: "insufficient_evidence" },
    },
    {
      id: "image-tag-does-not-change-asset-identity",
      candidate: candidate("trivy", "/Results/0/Vulnerabilities/2", "CVE-2025-12345", {
        affectedResource: {
          type: AffectedResourceType.Package,
          ecosystem: "apk",
          name: "zlib",
          version: "1.2.13-r0",
        },
        assetIdentifierCandidates: [
          identifier(AssetIdentifierType.OciImageName, "registry.example.test/platform/beacon"),
        ],
        sourceMetadata: {
          provenance: {
            document: {
              ArtifactType: "container_image",
              ArtifactName: "registry.example.test/platform/beacon:2.4.1",
              Metadata: { RepoTags: ["registry.example.test/platform/beacon:2.4.1"] },
            },
            scanResult: { Class: "os-pkgs", Type: "alpine" },
          },
        },
      }),
      expected: { status: "matched", assetId: beaconImage.id },
    },
    {
      id: "container-context-without-identifiers",
      // Synthetic typed image context: Trivy currently emits package/source resources.
      // Registry + repository identify the image; its tag is only a source snapshot.
      candidate: candidate("trivy", "/Results/0/Vulnerabilities/3", "CVE-2025-12345", {
        affectedResource: {
          type: AffectedResourceType.ContainerImage,
          registry: "registry.example.test",
          repository: "platform/beacon",
          tag: "2.5.0",
        },
        sourceMetadata: {
          provenance: {
            document: {
              ArtifactType: "container_image",
              ArtifactName: "registry.example.test/platform/beacon:2.5.0",
            },
          },
        },
      }),
      expected: { status: "matched", assetId: beaconImage.id },
    },
    {
      id: "container-repository-with-unknown-registry",
      // The same repository path exists in two registries. This is partial image
      // identity, not display-name similarity; neither asset is selected by any ID.
      candidate: candidate("trivy", "/Results/0/Vulnerabilities/4", "CVE-2025-12345", {
        affectedResource: {
          type: AffectedResourceType.ContainerImage,
          repository: "platform/beacon",
          tag: "2.5.0",
        },
        sourceMetadata: {
          provenance: { document: { ArtifactType: "container_image" } },
        },
      }),
      expected: { status: "unresolved", reason: "ambiguous" },
    },
    {
      id: "contextual-repository-absent-from-inventory",
      candidate: candidate("semgrep", "/results/2", "typescript.security.unsafe-redirect", {
        affectedResource: {
          type: AffectedResourceType.SourceCode,
          repository: "https://git.example.test/platform/Harbor.git",
          file: "service/routes/redirect.ts",
          location: { startLine: 24 },
        },
        sourceMetadata: { provenance: { result: { path: "service/routes/redirect.ts" } } },
      }),
      expected: { status: "unresolved", reason: "no_match" },
    },
    {
      id: "server-less-repository-path-unique",
      // Synthetic owner/name repository context without a server. Path case is
      // significant, so only the mixed-case Beacon repository fits.
      candidate: candidate("semgrep", "/results/3", "typescript.security.unsafe-redirect", {
        affectedResource: {
          type: AffectedResourceType.SourceCode,
          repository: "platform/Beacon",
          file: "service/routes/redirect.ts",
          location: { startLine: 24 },
        },
        sourceMetadata: { provenance: { result: { path: "service/routes/redirect.ts" } } },
      }),
      expected: { status: "matched", assetId: beaconRepository.id },
    },
    {
      id: "server-less-repository-path-on-several-servers",
      // The same lowercase path exists on the primary and mirror servers.
      candidate: candidate("semgrep", "/results/4", "typescript.security.unsafe-redirect", {
        affectedResource: {
          type: AffectedResourceType.SourceCode,
          repository: "platform/beacon",
          file: "service/routes/redirect.ts",
          location: { startLine: 24 },
        },
        sourceMetadata: { provenance: { result: { path: "service/routes/redirect.ts" } } },
      }),
      expected: { status: "unresolved", reason: "ambiguous" },
    },
    {
      id: "registry-less-image-path-unique",
      // Synthetic typed image context without a registry; only one registry hosts this path.
      candidate: candidate("trivy", "/Results/0/Vulnerabilities/5", "CVE-2025-12345", {
        affectedResource: {
          type: AffectedResourceType.ContainerImage,
          repository: "platform/lantern",
          tag: "1.0.3",
        },
        sourceMetadata: {
          provenance: { document: { ArtifactType: "container_image" } },
        },
      }),
      expected: { status: "matched", assetId: lanternImage.id },
    },
  ],
};

const mapleLogs = asset(301, "Maple application logs", AssetType.CloudResource, [
  identifier(
    AssetIdentifierType.CloudResourceId,
    "arn:aws:logs:eu-west-1:111122223333:log-group:/services/maple",
  ),
]);
const otherAccountLogs = asset(302, "Maple application logs", AssetType.CloudResource, [
  identifier(
    AssetIdentifierType.CloudResourceId,
    "arn:aws:logs:eu-west-1:444455556666:log-group:/services/maple",
  ),
]);
const caseDistinctLogs = asset(303, "Maple batch logs", AssetType.CloudResource, [
  identifier(
    AssetIdentifierType.CloudResourceId,
    "arn:aws:logs:eu-west-1:111122223333:log-group:/services/Maple",
  ),
]);
const lowerScopeGateway = asset(304, "Shared gateway", AssetType.Host, [
  identifier(AssetIdentifierType.DnsName, "gateway.example.test", "zone-a"),
  identifier(AssetIdentifierType.IpAddress, "203.0.113.30", "zone-a"),
]);
const upperScopeGateway = asset(305, "Shared gateway", AssetType.Host, [
  identifier(AssetIdentifierType.DnsName, "gateway.example.test", "Zone-A"),
  identifier(AssetIdentifierType.IpAddress, "203.0.113.30", "Zone-A"),
]);
const globalGateway = asset(306, "Shared gateway", AssetType.Host, [
  identifier(AssetIdentifierType.DnsName, "gateway.example.test"),
  identifier(AssetIdentifierType.IpAddress, "203.0.113.30"),
]);
const ledgerDatabase = asset(307, "Ledger database", AssetType.Host, [
  identifier(AssetIdentifierType.DnsName, "ledger.db.example.test", "vpc-a"),
  identifier(AssetIdentifierType.IpAddress, "203.0.113.50", "vpc-a"),
]);
const batchRunnerA = asset(308, "Batch runner", AssetType.Host, [
  identifier(AssetIdentifierType.IpAddress, "203.0.113.60", "vpc-a"),
]);
const batchRunnerB = asset(309, "Batch runner", AssetType.Host, [
  identifier(AssetIdentifierType.IpAddress, "203.0.113.60", "vpc-b"),
]);

const cloudScoped: InventoryScenario = {
  id: "cloud-scoped",
  assets: [
    mapleLogs,
    otherAccountLogs,
    caseDistinctLogs,
    lowerScopeGateway,
    upperScopeGateway,
    globalGateway,
    ledgerDatabase,
    batchRunnerA,
    batchRunnerB,
  ],
  cases: [
    {
      id: "canonical-cloud-resource-identifier",
      // Synthetic deployed-resource enrichment; native Checkov only identifies IaC locations.
      candidate: candidate("checkov", "/results/failed_checks/0", "CKV_CUSTOM_LOG_ENCRYPTION", {
        affectedResource: {
          type: AffectedResourceType.SourceCode,
          file: "infra/telemetry/logging.tf",
          symbol: "aws_cloudwatch_log_group.application",
          location: { startLine: 12, endLine: 18 },
        },
        assetIdentifierCandidates: [
          identifier(
            AssetIdentifierType.CloudResourceId,
            "arn:aws:logs:eu-west-1:111122223333:log-group:/services/maple",
          ),
        ],
        sourceMetadata: {
          provenance: {
            document: { check_type: "terraform" },
            result: {
              file_path: "infra/telemetry/logging.tf",
              resource: "aws_cloudwatch_log_group.application",
            },
          },
        },
      }),
      expected: { status: "matched", assetId: mapleLogs.id },
    },
    {
      id: "cloud-account-context-without-identifiers",
      // Synthetic trusted cloud context in the shared resource shape. AWS + account +
      // region + service-qualified local ID identify exactly one inventory ARN.
      candidate: candidate("checkov", "/results/failed_checks/1", "CKV_CUSTOM_LOG_ENCRYPTION", {
        affectedResource: {
          type: AffectedResourceType.CloudResource,
          provider: "aws",
          providerAccount: "111122223333",
          region: "eu-west-1",
          resourceId: "log-group:/services/maple",
        },
        sourceMetadata: { provenance: { document: { check_type: "terraform" } } },
      }),
      expected: { status: "matched", assetId: mapleLogs.id },
    },
    {
      id: "cloud-resource-value-case-is-significant",
      candidate: candidate("checkov", "/results/failed_checks/2", "CKV_CUSTOM_LOG_ENCRYPTION", {
        affectedResource: {
          type: AffectedResourceType.CloudResource,
          provider: "aws",
          resourceId: "arn:aws:logs:eu-west-1:111122223333:log-group:/services/Maple",
        },
        assetIdentifierCandidates: [
          identifier(
            AssetIdentifierType.CloudResourceId,
            "arn:aws:logs:eu-west-1:111122223333:log-group:/services/Maple",
          ),
        ],
        sourceMetadata: { provenance: { document: { check_type: "terraform" } } },
      }),
      expected: { status: "matched", assetId: caseDistinctLogs.id },
    },
    {
      id: "cloud-local-resource-with-unknown-account",
      // Both accounts contain this exact regional log-group identity. The absent
      // account leaves two plausible assets, with no contradictory canonical IDs.
      // The case-distinct /services/Maple group is not one of those possibilities.
      candidate: candidate("checkov", "/results/failed_checks/3", "CKV_CUSTOM_LOG_ENCRYPTION", {
        affectedResource: {
          type: AffectedResourceType.CloudResource,
          provider: "aws",
          region: "eu-west-1",
          resourceId: "log-group:/services/maple",
        },
        sourceMetadata: { provenance: { document: { check_type: "terraform" } } },
      }),
      expected: { status: "unresolved", reason: "ambiguous" },
    },
    {
      id: "scoped-dns-and-ip",
      // Namespace assignment is synthetic trusted context, not inferred from scanner source.
      candidate: candidate("nuclei", "line:1", "tls-version", {
        affectedResource: {
          type: AffectedResourceType.NetworkService,
          host: "gateway.example.test",
          port: 443,
          transport: "tcp",
          protocol: "tls",
        },
        assetIdentifierCandidates: [
          identifier(AssetIdentifierType.DnsName, "gateway.example.test", "zone-a"),
          identifier(AssetIdentifierType.IpAddress, "203.0.113.30", "zone-a"),
        ],
        sourceMetadata: { type: "ssl", host: "gateway.example.test", ip: "203.0.113.30" },
      }),
      expected: { status: "matched", assetId: lowerScopeGateway.id },
    },
    {
      id: "namespace-case-is-significant",
      candidate: candidate("nuclei", "line:2", "tls-version", {
        affectedResource: {
          type: AffectedResourceType.NetworkService,
          host: "gateway.example.test",
          port: 443,
          transport: "tcp",
          protocol: "tls",
        },
        assetIdentifierCandidates: [
          identifier(AssetIdentifierType.DnsName, "gateway.example.test", "Zone-A"),
          identifier(AssetIdentifierType.IpAddress, "203.0.113.30", "Zone-A"),
        ],
        sourceMetadata: { type: "ssl", host: "gateway.example.test", ip: "203.0.113.30" },
      }),
      expected: { status: "matched", assetId: upperScopeGateway.id },
    },
    {
      id: "global-is-not-any-namespace",
      candidate: candidate("nuclei", "line:3", "tls-version", {
        affectedResource: {
          type: AffectedResourceType.NetworkService,
          host: "gateway.example.test",
          port: 443,
          transport: "tcp",
          protocol: "tls",
        },
        assetIdentifierCandidates: [
          identifier(AssetIdentifierType.DnsName, "gateway.example.test"),
          identifier(AssetIdentifierType.IpAddress, "203.0.113.30"),
        ],
        sourceMetadata: { type: "ssl", host: "gateway.example.test", ip: "203.0.113.30" },
      }),
      expected: { status: "matched", assetId: globalGateway.id },
    },
    {
      id: "identified-namespace-absent-from-inventory",
      // Same host text in other scopes is not evidence of identity in explicit zone-b.
      candidate: candidate("nuclei", "line:4", "tls-version", {
        affectedResource: {
          type: AffectedResourceType.NetworkService,
          host: "gateway.example.test",
          port: 443,
          transport: "tcp",
          protocol: "tls",
        },
        assetIdentifierCandidates: [
          identifier(AssetIdentifierType.DnsName, "gateway.example.test", "zone-b"),
          identifier(AssetIdentifierType.IpAddress, "203.0.113.30", "zone-b"),
        ],
        sourceMetadata: { type: "ssl", host: "gateway.example.test", ip: "203.0.113.30" },
      }),
      expected: { status: "unresolved", reason: "no_match" },
    },
    {
      id: "unscoped-identifier-in-one-namespace",
      // Normalizers cannot know namespaces, so null may mean unknown scope. With no
      // global holder, the only namespaced holder of this address is selected.
      candidate: candidate("nuclei", "line:5", "tls-version", {
        affectedResource: {
          type: AffectedResourceType.NetworkService,
          host: "203.0.113.50",
          port: 5432,
          transport: "tcp",
        },
        assetIdentifierCandidates: [identifier(AssetIdentifierType.IpAddress, "203.0.113.50")],
        sourceMetadata: { type: "tcp", ip: "203.0.113.50", "matched-at": "203.0.113.50:5432" },
      }),
      expected: { status: "matched", assetId: ledgerDatabase.id },
    },
    {
      id: "unscoped-identifier-in-several-namespaces",
      // Overlapping private networks reuse this address; unknown scope cannot choose.
      candidate: candidate("nuclei", "line:6", "tls-version", {
        affectedResource: {
          type: AffectedResourceType.NetworkService,
          host: "203.0.113.60",
          port: 22,
          transport: "tcp",
        },
        assetIdentifierCandidates: [identifier(AssetIdentifierType.IpAddress, "203.0.113.60")],
        sourceMetadata: { type: "tcp", ip: "203.0.113.60", "matched-at": "203.0.113.60:22" },
      }),
      expected: { status: "unresolved", reason: "ambiguous" },
    },
  ],
};

export const dataset: EvaluationDataset = {
  id: "asset-matching-v1",
  scenarios: [network, repositoriesImages, cloudScoped],
};
