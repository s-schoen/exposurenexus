import { AssetIdentifierType } from "@exposurenexus/contracts/model/asset-identifier";
import { describe, expect, it } from "vitest";

import {
  assetIdentifierRecordSchema,
  assetIdentifierSchema,
  normalizeAssetIdentifier,
  validateAssetIdentifier,
} from "./asset-identifier/schema.js";

function identifier(type: AssetIdentifierType, value: string, namespace?: string | null) {
  return normalizeAssetIdentifier({
    type,
    value,
    ...(namespace === undefined ? {} : { namespace }),
  });
}

describe("asset identifier normalization", () => {
  it("normalizes DNS names through IDNA and removes one root dot", () => {
    expect(identifier(AssetIdentifierType.DnsName, "BÜCHER.Example.")).toEqual({
      type: AssetIdentifierType.DnsName,
      namespace: null,
      value: "xn--bcher-kva.example",
    });
  });

  it("rejects DNS values that are not hostnames", () => {
    for (const value of [
      "https://example.com",
      "example.com:443",
      "example.com/path",
      "*.example.com",
      "example.com..",
      "foo..example.com",
      "-example.com",
      "example-.com",
      "127.0.0.1",
    ]) {
      expect(() => identifier(AssetIdentifierType.DnsName, value)).toThrow();
    }
  });

  it("canonicalizes IPv4 and IPv6 addresses", () => {
    expect(identifier(AssetIdentifierType.IpAddress, "192.0.2.1").value).toBe("192.0.2.1");
    expect(identifier(AssetIdentifierType.IpAddress, "2001:0DB8:0:0:0:0:2:1").value).toBe(
      "2001:db8::2:1",
    );
    expect(identifier(AssetIdentifierType.IpAddress, "::FFFF:192.0.2.128").value).toBe(
      "::ffff:c000:280",
    );
  });

  it("rejects IP URLs, ranges, ports, and zone identifiers", () => {
    for (const value of [
      "192.0.2.1/32",
      "https://192.0.2.1",
      "192.0.2.1:443",
      "[::1]:443",
      "fe80::1%eth0",
      "999.0.2.1",
    ]) {
      expect(() => identifier(AssetIdentifierType.IpAddress, value)).toThrow();
    }
  });

  it("canonicalizes common VCS transports to server and path", () => {
    const canonical = identifier(AssetIdentifierType.VcsRepository, "github.com/Org/Repo");

    for (const value of [
      "git@GitHub.com:Org/Repo.git",
      "ssh://git@github.com/Org/Repo.git",
      "https://github.com/Org/Repo.git",
      "http://github.com/Org/Repo",
    ]) {
      expect(identifier(AssetIdentifierType.VcsRepository, value)).toEqual(canonical);
    }

    expect(
      identifier(AssetIdentifierType.VcsRepository, "git@[2001:0DB8::1]:Org/Repo.git").value,
    ).toBe("[2001:db8::1]/Org/Repo");
    expect(
      identifier(AssetIdentifierType.VcsRepository, "gitlab.com/group/subgroup/tree/repo").value,
    ).toBe("gitlab.com/group/subgroup/tree/repo");
  });

  it("rejects VCS credentials, refs, queries, fragments, and unsupported transports", () => {
    for (const value of [
      "https://user:password@github.com/Org/Repo",
      "https://github.com/Org/Repo?ref=main",
      "https://github.com/Org/Repo#main",
      "https://github.com/Org/Repo/tree/main",
      "https://github.com/Org/Repo/releases/tag/v1",
      "https://gitlab.com/Group/Repo/-/tree/main",
      "git://github.com/Org/Repo",
      "git@github.com:",
    ]) {
      expect(() => identifier(AssetIdentifierType.VcsRepository, value)).toThrow();
    }
  });

  it("keeps registryless and qualified OCI image names distinct", () => {
    expect(identifier(AssetIdentifierType.OciImageName, "nginx").value).toBe("nginx");
    expect(identifier(AssetIdentifierType.OciImageName, "library/nginx").value).toBe(
      "library/nginx",
    );
    expect(identifier(AssetIdentifierType.OciImageName, "docker.io/library/nginx").value).toBe(
      "docker.io/library/nginx",
    );
    expect(identifier(AssetIdentifierType.OciImageName, "localhost:5000/team/app").value).toBe(
      "localhost:5000/team/app",
    );
    expect(identifier(AssetIdentifierType.OciImageName, "library/my_image.name").value).toBe(
      "library/my_image.name",
    );
    expect(
      identifier(AssetIdentifierType.OciImageName, "REGISTRY.Example.com/Team/App").value,
    ).toBe("registry.example.com/team/app");
  });

  it("rejects OCI tags, digests, schemes, and incomplete qualified names", () => {
    for (const value of [
      "nginx:latest",
      "library/nginx:latest",
      "docker.io/library/nginx@sha256:abcd",
      "https://docker.io/library/nginx",
      "repo:5000",
      "registry.example.com",
      "registry.example.com:/repo",
      "library/repo_",
      "library/repo...",
    ]) {
      expect(() => identifier(AssetIdentifierType.OciImageName, value)).toThrow();
    }
  });

  it("trims cloud resource IDs while preserving case", () => {
    expect(
      identifier(AssetIdentifierType.CloudResourceId, "  Arn:AWS:EC2:Example/Resource  ").value,
    ).toBe("Arn:AWS:EC2:Example/Resource");
  });

  it("normalizes optional namespaces without changing their case", () => {
    expect(identifier(AssetIdentifierType.CloudResourceId, "resource")).toEqual({
      type: AssetIdentifierType.CloudResourceId,
      namespace: null,
      value: "resource",
    });
    expect(
      identifier(AssetIdentifierType.CloudResourceId, "resource", "  Prod/Team  ").namespace,
    ).toBe("Prod/Team");
    expect(identifier(AssetIdentifierType.CloudResourceId, "resource", null).namespace).toBeNull();

    for (const namespace of ["", "   "]) {
      expect(() =>
        identifier(AssetIdentifierType.CloudResourceId, "resource", namespace),
      ).toThrow();
    }
  });

  it("enforces normalized value and namespace length limits", () => {
    expect(
      identifier(AssetIdentifierType.CloudResourceId, ` ${"a".repeat(2048)} `).value,
    ).toHaveLength(2048);
    expect(
      identifier(AssetIdentifierType.CloudResourceId, "resource", "n".repeat(255)).namespace,
    ).toHaveLength(255);

    expect(() => identifier(AssetIdentifierType.CloudResourceId, "a".repeat(2049))).toThrow();
    expect(() =>
      identifier(AssetIdentifierType.CloudResourceId, "resource", "n".repeat(256)),
    ).toThrow();
  });

  it("returns structured, JSON-safe validation issues", () => {
    const invalid = validateAssetIdentifier({
      type: AssetIdentifierType.DnsName,
      value: "https://example.com",
    });

    expect(invalid).toEqual({
      success: false,
      issues: [
        {
          path: ["value"],
          reason: "invalid_format",
          detail: "dns_scheme",
          message: "DNS names must not contain a scheme.",
        },
      ],
    });

    expect(
      validateAssetIdentifier({
        type: AssetIdentifierType.CloudResourceId,
        value: "resource",
        extra: true,
      }),
    ).toMatchObject({
      success: false,
      issues: [{ path: [], reason: "unrecognized_key" }],
    });
  });

  it("preserves deliberately distinct identity values", () => {
    expect(identifier(AssetIdentifierType.DnsName, "example.com")).not.toEqual(
      identifier(AssetIdentifierType.DnsName, "example.net"),
    );
    expect(identifier(AssetIdentifierType.IpAddress, "192.0.2.1")).not.toEqual(
      identifier(AssetIdentifierType.IpAddress, "192.0.2.2"),
    );
    expect(identifier(AssetIdentifierType.VcsRepository, "github.com/Org/Repo")).not.toEqual(
      identifier(AssetIdentifierType.VcsRepository, "github.com/org/Repo"),
    );
    expect(identifier(AssetIdentifierType.OciImageName, "nginx")).not.toEqual(
      identifier(AssetIdentifierType.OciImageName, "docker.io/library/nginx"),
    );
    expect(identifier(AssetIdentifierType.CloudResourceId, "Resource")).not.toEqual(
      identifier(AssetIdentifierType.CloudResourceId, "resource"),
    );
  });

  it("exposes the canonical parser through the schema", () => {
    expect(
      assetIdentifierSchema.parse({ type: AssetIdentifierType.DnsName, value: "Example.COM" }),
    ).toEqual({
      type: AssetIdentifierType.DnsName,
      namespace: null,
      value: "example.com",
    });
  });

  it("parses response records with stable identifier ids", () => {
    expect(
      assetIdentifierRecordSchema.parse({
        id: "d8f05cbe-d12c-4d05-a969-cee572a77887",
        type: AssetIdentifierType.DnsName,
        namespace: null,
        value: "Example.COM",
      }),
    ).toEqual({
      id: "d8f05cbe-d12c-4d05-a969-cee572a77887",
      type: AssetIdentifierType.DnsName,
      namespace: null,
      value: "example.com",
    });
  });
});
