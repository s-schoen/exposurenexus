import { AffectedResourceType } from "@exposurenexus/contracts/model/affected-resource";
import { AssetIdentifierType } from "@exposurenexus/contracts/model/asset-identifier";
import { VulnerabilitySeverity } from "@exposurenexus/contracts/model/vulnerability";
import { describe, expect, it, vi } from "vitest";

import { IdentifierAssetMatcher } from "./identifier-matcher.js";

import type { ObservationCandidate } from "../classifier.js";
import type { IdentifierInventory, InventoryIdentifier } from "./identifier-matcher.js";
import type { ObservationAffectedResource } from "@exposurenexus/contracts/model/affected-resource";
import type { AssetIdentifier } from "@exposurenexus/contracts/model/asset-identifier";
import type { Logger } from "pino";

const { DnsName, IpAddress, VcsRepository, OciImageName, CloudResourceId } = AssetIdentifierType;
const logger = { debug: vi.fn() } as unknown as Logger;

function held(
  assetId: string,
  type: AssetIdentifierType,
  value: string,
  namespace: string | null = null,
): InventoryIdentifier {
  return { assetId, type, namespace, value };
}

function id(type: AssetIdentifierType, value: string, namespace: string | null = null) {
  return { type, namespace, value } satisfies AssetIdentifier;
}

function candidate(
  assetIdentifierCandidates: AssetIdentifier[],
  affectedResource: ObservationAffectedResource = { type: AffectedResourceType.Unspecified },
): ObservationCandidate {
  return {
    source: "nuclei",
    sourceRecord: "line:1",
    title: "Example portal.example.test",
    description: null,
    remediation: null,
    evidence: "Host: portal.example.test",
    severity: VulnerabilitySeverity.Medium,
    weakness: { identifiers: {} },
    affectedResource,
    observedAt: null,
    assetIdentifierCandidates,
    sourceMetadata: { host: "portal.example.test" },
  };
}

function inventory(identifiers: InventoryIdentifier[], existing?: string[]): IdentifierInventory {
  const assetIds = new Set(existing ?? identifiers.map((identifier) => identifier.assetId));
  return {
    listIdentifiers: vi.fn(async () => identifiers),
    hasAsset: vi.fn(async (assetId: string) => assetIds.has(assetId)),
  };
}

async function match(identifiers: InventoryIdentifier[], input: ObservationCandidate) {
  return new IdentifierAssetMatcher(inventory(identifiers)).match(input, logger);
}

const hosts = [
  held("portal", DnsName, "portal.example.test"),
  held("portal", IpAddress, "192.0.2.10"),
  held("gateway", DnsName, "gateway.example.test"),
  held("gateway", IpAddress, "198.51.100.20"),
];

describe("IdentifierAssetMatcher exact identifiers", () => {
  it("matches one asset and ignores identifiers without inventory hits", async () => {
    const result = await match(
      hosts,
      candidate([id(DnsName, "portal.example.test"), id(IpAddress, "192.0.2.99")]),
    );
    expect(result).toMatchObject({ status: "matched", assetId: "portal" });
  });

  it("reports identifiers resolving to different assets as conflicting", async () => {
    const result = await match(
      hosts,
      candidate([id(DnsName, "portal.example.test"), id(IpAddress, "198.51.100.20")]),
    );
    expect(result).toMatchObject({ status: "unresolved", reason: "conflicting_identifiers" });
  });

  it("prefers an exact global hit over namespaced holders of the same value", async () => {
    const result = await match(
      [...hosts, held("scoped", DnsName, "portal.example.test", "zone-a")],
      candidate([id(DnsName, "portal.example.test")]),
    );
    expect(result).toMatchObject({ status: "matched", assetId: "portal" });
  });

  it("does not consult affected-resource identity when explicit identifiers miss", async () => {
    const result = await match(
      hosts,
      candidate([id(DnsName, "portal.example.test", "zone-b")], {
        type: AffectedResourceType.WebEndpoint,
        host: "gateway.example.test",
      }),
    );
    expect(result).toMatchObject({ status: "unresolved", reason: "no_match" });
  });

  it("never treats display names, free text, or metadata as evidence", async () => {
    const result = await match(hosts, candidate([]));
    expect(result).toMatchObject({ status: "unresolved", reason: "insufficient_evidence" });
  });
});

describe("IdentifierAssetMatcher partial identity", () => {
  it("falls back from a null namespace to a single namespaced holder", async () => {
    const result = await match(
      [held("scoped", IpAddress, "203.0.113.50", "vpc-a")],
      candidate([id(IpAddress, "203.0.113.50")]),
    );
    expect(result).toMatchObject({ status: "matched", assetId: "scoped" });
  });

  it("keeps an explicit namespace strict", async () => {
    const result = await match(
      [held("scoped", IpAddress, "203.0.113.50", "vpc-a")],
      candidate([id(IpAddress, "203.0.113.50", "vpc-b")]),
    );
    expect(result).toMatchObject({ status: "unresolved", reason: "no_match" });
  });

  it("narrows across evidence items without letting misses veto", async () => {
    const result = await match(
      [
        held("a", DnsName, "portal.example.test", "zone-a"),
        held("b", DnsName, "portal.lab.example.test", "zone-b"),
        held("b", IpAddress, "192.0.2.50", "zone-b"),
      ],
      candidate([id(DnsName, "portal"), id(IpAddress, "192.0.2.50"), id(IpAddress, "192.0.2.99")]),
    );
    expect(result).toMatchObject({ status: "matched", assetId: "b" });
  });

  it("reports partial readings that point to different assets as conflicting", async () => {
    const result = await match(
      [
        held("a", DnsName, "portal.example.test", "zone-a"),
        held("b", IpAddress, "192.0.2.50", "zone-b"),
      ],
      candidate([id(DnsName, "portal"), id(IpAddress, "192.0.2.50")]),
    );
    expect(result).toMatchObject({ status: "unresolved", reason: "conflicting_identifiers" });
  });

  it("expands a namespaced short hostname only within its namespace", async () => {
    const result = await match(
      [
        held("a", DnsName, "portal.example.test", "zone-a"),
        held("b", DnsName, "portal.example.test", "zone-b"),
      ],
      candidate([id(DnsName, "portal", "zone-a")]),
    );
    expect(result).toMatchObject({ status: "matched", assetId: "a" });
  });

  it("does not expand a hostname into its subdomains or parents", async () => {
    const result = await match(
      [held("parent", DnsName, "example.test"), held("child", DnsName, "api.portal.example.test")],
      candidate([id(DnsName, "portal.example.test")]),
    );
    expect(result).toMatchObject({ status: "unresolved", reason: "no_match" });
  });

  it("matches a registry-less image path across registries", async () => {
    const images = [
      held("primary", OciImageName, "registry.example.test/platform/beacon"),
      held("mirror", OciImageName, "mirror.example.test/platform/beacon"),
    ];
    const result = await match(images, candidate([id(OciImageName, "platform/beacon")]));
    expect(result).toMatchObject({ status: "unresolved", reason: "ambiguous" });
  });

  it("treats a server-less repository path as partial and a bare name as no evidence", async () => {
    const repositories = [held("beacon", VcsRepository, "git.example.test/platform/Beacon")];
    const sourceCode = (repository: string) =>
      candidate([], { type: AffectedResourceType.SourceCode, repository });

    expect(await match(repositories, sourceCode("platform/Beacon.git"))).toMatchObject({
      status: "matched",
      assetId: "beacon",
    });
    expect(await match(repositories, sourceCode("platform/beacon"))).toMatchObject({
      reason: "no_match",
    });
    expect(await match(repositories, sourceCode("Beacon"))).toMatchObject({
      reason: "insufficient_evidence",
    });
  });

  it("matches AWS resource parts on partition family, region, and account", async () => {
    const logs = [
      held("eu", CloudResourceId, "arn:aws:logs:eu-west-1:111122223333:log-group:/app"),
      held("cn", CloudResourceId, "arn:aws-cn:logs:cn-north-1:111122223333:log-group:/app"),
    ];
    const cloud = (
      fields: Omit<
        Extract<ObservationAffectedResource, { type: AffectedResourceType.CloudResource }>,
        "type"
      >,
    ) => candidate([], { type: AffectedResourceType.CloudResource, provider: "AWS", ...fields });

    expect(await match(logs, cloud({ resourceId: "log-group:/app" }))).toMatchObject({
      reason: "ambiguous",
    });
    expect(
      await match(logs, cloud({ resourceId: "log-group:/app", region: "cn-north-1" })),
    ).toMatchObject({ status: "matched", assetId: "cn" });
    expect(
      await match(logs, cloud({ resourceId: "log-group:/app", providerAccount: "444455556666" })),
    ).toMatchObject({ reason: "no_match" });
  });
});

describe("IdentifierAssetMatcher affected-resource identity", () => {
  it("derives identifiers from bracketed IPv6 hosts and provider-native resource IDs", async () => {
    const identifiers = [
      held("v6", IpAddress, "2001:db8::30"),
      held("vm", CloudResourceId, "/subscriptions/0000/resourceGroups/app/providers/vm/web"),
    ];
    expect(
      await match(
        identifiers,
        candidate([], { type: AffectedResourceType.NetworkService, host: "[2001:DB8::30]" }),
      ),
    ).toMatchObject({ status: "matched", assetId: "v6" });
    expect(
      await match(
        identifiers,
        candidate([], {
          type: AffectedResourceType.CloudResource,
          provider: "azure",
          resourceId: "/subscriptions/0000/resourceGroups/app/providers/vm/web",
        }),
      ),
    ).toMatchObject({ status: "matched", assetId: "vm" });
  });

  it("never treats package identity as asset identity", async () => {
    const result = await match(
      hosts,
      candidate([], { type: AffectedResourceType.Package, name: "portal.example.test" }),
    );
    expect(result).toMatchObject({ status: "unresolved", reason: "insufficient_evidence" });
  });
});

describe("IdentifierAssetMatcher cloud context", () => {
  const cloudId = "arn:aws:logs:eu-west-1:111122223333:log-group:/services/app";
  type CloudFields = Omit<
    Extract<ObservationAffectedResource, { type: AffectedResourceType.CloudResource }>,
    "type"
  >;
  const cloud = (fields: CloudFields) =>
    candidate([], { type: AffectedResourceType.CloudResource, ...fields });

  it.each([
    "arn:aws:s3:::example-bucket",
    "arn:aws:iam::111122223333:role/example",
    "arn:aws:apigateway:eu-west-1::/restapis/abc123",
    "arn:aws:s3::111122223333:accesspoint/mfzwi23gnjvgw.mrap",
  ])("matches a full ARN with its own scope rules as context: %s", async (arn) => {
    expect(
      await match([held("arn", CloudResourceId, arn)], cloud({ resourceId: arn })),
    ).toMatchObject({
      status: "matched",
      assetId: "arn",
    });
  });

  it.each([
    ["aws", "eu-west-1", cloudId],
    ["aws-cn", "cn-north-1", "arn:aws-cn:logs:cn-north-1:111122223333:log-group:/services/app"],
    [
      "aws-us-gov",
      "us-gov-west-1",
      "arn:aws-us-gov:logs:us-gov-west-1:111122223333:log-group:/services/app",
    ],
  ])("matches a scoped log group in the %s partition", async (_partition, region, arn) => {
    const result = await match(
      [held("logs", CloudResourceId, arn)],
      cloud({
        provider: "aws",
        providerAccount: "111122223333",
        region,
        resourceId: "log-group:/services/app",
      }),
    );
    expect(result).toMatchObject({ status: "matched", assetId: "logs" });
  });

  it.each<CloudFields>([
    { provider: "azure" },
    { providerAccount: "444455556666" },
    { region: "eu-west-2" },
  ])("treats full-ARN context contradicted by %j as insufficient", async (fields) => {
    const result = await match(
      [held("logs", CloudResourceId, cloudId)],
      cloud({ resourceId: cloudId, ...fields }),
    );
    expect(result).toMatchObject({ status: "unresolved", reason: "insufficient_evidence" });
  });

  it.each([
    "arn:aws:logs:eu-west-1:111122223333:log-group:/services/App",
    "arn:aws:something-else:eu-west-1:111122223333:log-group:/services/app",
    "arn:aws:logs:eu-west-1:111122223333:log-group:/services/app:log-stream:stream",
  ])("does not conflate resource case, implied service, or subresources: %s", async (arn) => {
    const result = await match(
      [held("other", CloudResourceId, arn)],
      cloud({
        provider: "aws",
        providerAccount: "111122223333",
        region: "eu-west-1",
        resourceId: "log-group:/services/app",
      }),
    );
    expect(result).toMatchObject({ status: "unresolved", reason: "no_match" });
  });

  it("leaves the service open for unrecognized local resource formats", async () => {
    const identifiers = [
      held("a", CloudResourceId, "arn:aws:alpha:eu-west-1:111122223333:widget/main"),
      held("b", CloudResourceId, "arn:aws:beta:eu-west-1:111122223333:widget/main"),
    ];
    const result = await match(
      identifiers,
      cloud({ provider: "aws", region: "eu-west-1", resourceId: "widget/main" }),
    );
    expect(result).toMatchObject({ status: "unresolved", reason: "ambiguous" });
  });

  it("matches an incompletely scoped ARN exactly when it is an explicit identifier", async () => {
    const arn = "arn:aws:logs:eu-west-1::log-group:/services/app";
    expect(
      await match([held("logs", CloudResourceId, arn)], candidate([id(CloudResourceId, arn)])),
    ).toMatchObject({
      status: "matched",
      assetId: "logs",
    });
  });

  it("matches opaque cloud IDs exactly and case-sensitively", async () => {
    const identifiers = [held("opaque", CloudResourceId, "OpaqueCloudId")];
    expect(
      await match(identifiers, candidate([id(CloudResourceId, "OpaqueCloudId")])),
    ).toMatchObject({
      status: "matched",
    });
    expect(
      await match(identifiers, candidate([id(CloudResourceId, "opaquecloudid")])),
    ).toMatchObject({
      reason: "no_match",
    });
  });
});

describe("IdentifierAssetMatcher context normalization", () => {
  it.each<[ObservationAffectedResource, InventoryIdentifier]>([
    [
      { type: AffectedResourceType.WebEndpoint, host: "SERVICE.Example.Test.", path: "/login" },
      held("asset", DnsName, "service.example.test"),
    ],
    [
      { type: AffectedResourceType.NetworkService, host: "192.0.2.10", port: 443 },
      held("asset", IpAddress, "192.0.2.10"),
    ],
    [
      {
        type: AffectedResourceType.SourceCode,
        repository: "https://GIT.example.test/team/App.git",
      },
      held("asset", VcsRepository, "git.example.test/team/App"),
    ],
    [
      {
        type: AffectedResourceType.ContainerImage,
        registry: "REGISTRY.example.test:5000",
        repository: "Team/App",
        tag: "v2",
        digest: "sha256:snapshot-only",
      },
      held("asset", OciImageName, "registry.example.test:5000/team/app"),
    ],
  ])("canonicalizes %j before lookup", async (resource, identity) => {
    const input = candidate([], resource);
    const original = structuredClone(input);
    expect(await match([identity], input)).toMatchObject({ status: "matched", assetId: "asset" });
    expect(input).toStrictEqual(original);
  });

  it.each<ObservationAffectedResource>([
    { type: AffectedResourceType.SourceCode, file: "team/app/src/main.ts", revision: "abc123" },
    { type: AffectedResourceType.WebEndpoint, reportedUrl: "https://service.example.test" },
    { type: AffectedResourceType.NetworkService, host: "*.example.test" },
    {
      type: AffectedResourceType.ContainerImage,
      registry: "registry.example.test/path",
      repository: "app",
    },
    {
      type: AffectedResourceType.ContainerImage,
      registry: "registry.example.test",
      repository: "app:tag",
    },
    { type: AffectedResourceType.ContainerImage, registry: "registry.example.test" },
    { type: AffectedResourceType.CloudResource, resourceId: "arn:aws:s3:::*" },
    { type: AffectedResourceType.CloudResource, resourceId: "arn:aws:s3:::${bucket}" },
  ])("abstains on unusable context %j", async (resource) => {
    const identifiers = [
      held("asset", DnsName, "service.example.test"),
      held("asset", OciImageName, "registry.example.test/path/app"),
      held("asset", OciImageName, "registry.example.test/team/app"),
      held("asset", CloudResourceId, "arn:aws:s3:::*"),
    ];
    const result = await match(identifiers, candidate([], resource));
    expect(result).toMatchObject({ status: "unresolved", reason: "insufficient_evidence" });
  });
});

describe("IdentifierAssetMatcher inventory use", () => {
  it("does not report an asset that no longer exists", async () => {
    const matcher = new IdentifierAssetMatcher(inventory(hosts, ["gateway"]));
    const result = await matcher.match(candidate([id(DnsName, "portal.example.test")]), logger);
    expect(result).toMatchObject({ status: "unresolved", reason: "no_match" });
  });

  it("reads the current inventory on every call", async () => {
    let current = [held("portal", DnsName, "portal.example.test")];
    const matcher = new IdentifierAssetMatcher({
      listIdentifiers: async () => current,
      hasAsset: async (assetId) => current.some((identifier) => identifier.assetId === assetId),
    });
    const added = candidate([id(DnsName, "new.example.test")]);

    expect(await matcher.match(added, logger)).toMatchObject({ reason: "no_match" });
    current = [...current, held("new", DnsName, "new.example.test")];
    expect(await matcher.match(added, logger)).toMatchObject({
      status: "matched",
      assetId: "new",
    });
    current = [];
    expect(await matcher.match(added, logger)).toMatchObject({ reason: "no_match" });
  });

  it("propagates inventory failures instead of returning unresolved", async () => {
    const failure = new Error("inventory unavailable");
    const matcher = new IdentifierAssetMatcher({
      listIdentifiers: async () => {
        throw failure;
      },
      hasAsset: async () => true,
    });

    await expect(
      matcher.match(candidate([id(DnsName, "portal.example.test")]), logger),
    ).rejects.toBe(failure);
  });

  it.each<[string, InventoryIdentifier[]]>([
    ["missing asset ID", [held("", DnsName, "portal.example.test")]],
    ["noncanonical value", [held("portal", DnsName, "PORTAL.example.test.")]],
    [
      "identifier owned twice",
      [
        held("portal", DnsName, "portal.example.test"),
        held("other", DnsName, "portal.example.test"),
      ],
    ],
  ])("rejects an inventory with a %s using a log-safe error", async (_kind, identifiers) => {
    await expect(
      match(identifiers, candidate([id(DnsName, "portal.example.test")])),
    ).rejects.toThrow(/^Invalid asset inventory response\.$/);
  });

  it("keeps explanations free of identifier values and leaves the candidate untouched", async () => {
    const input = candidate([id(DnsName, "portal.example.test"), id(IpAddress, "198.51.100.20")]);
    const snapshot = structuredClone(input);
    const result = await match(hosts, input);

    expect(result.explanation).not.toMatch(/example\.test|198\.51/);
    expect(input).toStrictEqual(snapshot);
  });
});
