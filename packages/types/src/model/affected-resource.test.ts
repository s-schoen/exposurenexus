import { describe, expect, it } from "vitest";

import {
  AffectedResourceType,
  findingAffectedResourceSchema,
  normalizeFindingAffectedResource,
  observationAffectedResourceSchema,
  registerPackageNameNormalizer,
  WebEndpointComponentKind,
} from "./affected-resource.js";

const findingResource = (resource: unknown) => findingAffectedResourceSchema.parse(resource);
const observationResource = (resource: unknown) =>
  observationAffectedResourceSchema.parse(resource);

describe("affected-resource schemas", () => {
  it("accepts every canonical resource variant", () => {
    expect(findingResource({ type: AffectedResourceType.Asset })).toEqual({ type: "asset" });
    expect(findingResource({ type: AffectedResourceType.Unspecified })).toEqual({
      type: "unspecified",
    });
    expect(
      findingResource({
        type: AffectedResourceType.WebEndpoint,
        scheme: "HTTPS",
        host: "EXAMPLE.com",
        path: "/admin/../login",
        method: "get",
        component: { kind: WebEndpointComponentKind.QueryParameter, name: "id" },
      }),
    ).toEqual({
      type: "webEndpoint",
      scheme: "https",
      host: "example.com",
      path: "/login",
      method: "GET",
      component: { kind: "queryParameter", name: "id" },
      port: 443,
    });
    expect(
      findingResource({
        type: AffectedResourceType.NetworkService,
        host: "2001:0DB8:0:0:0:0:2:1",
        port: 5432,
        transport: "TCP",
        protocol: "PostgreSQL",
      }),
    ).toEqual({
      type: "networkService",
      host: "2001:db8::2:1",
      port: 5432,
      transport: "tcp",
      protocol: "postgresql",
    });
    expect(
      findingResource({
        type: AffectedResourceType.SourceCode,
        repository: "https://github.com/Org/Repo.git",
        file: "./src/../src/data.ts",
        location: { startLine: 434, startColumn: 12, endLine: 434, endColumn: 31 },
        locationFingerprint: "sha256:9dd7b2",
      }),
    ).toEqual({
      type: "sourceCode",
      repository: "github.com/Org/Repo",
      file: "src/data.ts",
      location: { startLine: 434, startColumn: 12, endLine: 434, endColumn: 31 },
      locationFingerprint: "sha256:9dd7b2",
    });
    expect(
      findingResource({
        type: AffectedResourceType.Package,
        ecosystem: "NPM",
        name: "@Scope/Package",
        installationPath: "package-lock.json",
      }),
    ).toEqual({
      type: "package",
      ecosystem: "npm",
      name: "@scope/package",
      installationPath: "package-lock.json",
    });
    expect(
      findingResource({
        type: AffectedResourceType.ContainerImage,
        registry: "REGISTRY.Example.com",
        repository: "Payments/Backend",
        digest: "SHA256:ABCD",
      }),
    ).toEqual({
      type: "containerImage",
      registry: "registry.example.com",
      repository: "payments/backend",
      digest: "sha256:ABCD",
    });
    expect(
      findingResource({
        type: AffectedResourceType.CloudResource,
        provider: "AWS",
        providerAccount: " 123456789012 ",
        region: "eu-central-1",
        resourceId: " arn:aws:s3:::example-bucket ",
        subresource: "bucket-policy",
      }),
    ).toEqual({
      type: "cloudResource",
      provider: "aws",
      providerAccount: "123456789012",
      region: "eu-central-1",
      resourceId: "arn:aws:s3:::example-bucket",
      subresource: "bucket-policy",
    });
  });

  it("accepts partial concrete resources and applies canonical defaults", () => {
    expect(normalizeFindingAffectedResource({ type: "webEndpoint" })).toEqual({
      type: "webEndpoint",
      path: "/",
    });
    expect(normalizeFindingAffectedResource({ type: "sourceCode", file: "src/main.ts" })).toEqual({
      type: "sourceCode",
      file: "src/main.ts",
    });
    expect(normalizeFindingAffectedResource({ type: "package", name: "Package" })).toEqual({
      type: "package",
      name: "Package",
    });
    expect(() =>
      normalizeFindingAffectedResource({ type: "containerImage", tag: "latest" }),
    ).toThrow();
    expect(normalizeFindingAffectedResource({ type: "cloudResource", provider: "aws" })).toEqual({
      type: "cloudResource",
      provider: "aws",
    });
  });

  it("supports observation-only source snapshots without accepting them canonically", () => {
    expect(
      observationResource({
        type: "webEndpoint",
        reportedUrl: "https://EXAMPLE.com:443/admin",
      }),
    ).toEqual({
      type: "webEndpoint",
      reportedUrl: "https://EXAMPLE.com:443/admin",
      path: "/",
    });
    expect(observationResource({ type: "sourceCode", revision: "d6c3b8" })).toEqual({
      type: "sourceCode",
      revision: "d6c3b8",
    });
    expect(observationResource({ type: "package", version: "4.21.2" })).toEqual({
      type: "package",
      version: "4.21.2",
    });
    expect(
      observationResource({
        type: "containerImage",
        repository: "payments/backend",
        tag: "latest",
      }),
    ).toEqual({
      type: "containerImage",
      repository: "payments/backend",
      tag: "latest",
    });
    expect(observationResource({ type: "cloudResource", displayName: "Example bucket" })).toEqual({
      type: "cloudResource",
      displayName: "Example bucket",
    });

    expect(() =>
      findingResource({ type: "webEndpoint", reportedUrl: "https://example.com" }),
    ).toThrow();
    expect(() => findingResource({ type: "sourceCode", revision: "d6c3b8" })).toThrow();
    expect(() => findingResource({ type: "package", version: "4.21.2" })).toThrow();
    expect(() => findingResource({ type: "containerImage", tag: "latest" })).toThrow();
    expect(() =>
      findingResource({ type: "cloudResource", displayName: "Example bucket" }),
    ).toThrow();
  });

  it("rejects unknown and cross-variant fields", () => {
    expect(() => findingResource({ type: "asset", host: "example.com" })).toThrow();
    expect(() => findingResource({ type: "webEndpoint", protocol: "http" })).toThrow();
    expect(() =>
      observationResource({ type: "networkService", reportedUrl: "https://example.com" }),
    ).toThrow();
    expect(() => findingResource({ type: "unknown" })).toThrow();
    expect(() =>
      findingResource({ type: "webEndpoint", component: { kind: "endpoint", name: "id" } }),
    ).toThrow();
    expect(() =>
      findingResource({ type: "webEndpoint", component: { kind: "queryParameter" } }),
    ).toThrow();
  });

  it("enforces ports, methods, locations, and repository-relative paths", () => {
    for (const port of [0, 65536, 1.5]) {
      expect(() => findingResource({ type: "webEndpoint", port })).toThrow();
      expect(() => findingResource({ type: "networkService", port })).toThrow();
    }
    expect(() => findingResource({ type: "webEndpoint", method: "not a method" })).toThrow();
    expect(() => findingResource({ type: "sourceCode", location: { startLine: 0 } })).toThrow();
    expect(() =>
      findingResource({ type: "sourceCode", location: { startLine: 10, endLine: 9 } }),
    ).toThrow();
    expect(() =>
      findingResource({
        type: "sourceCode",
        location: { startLine: 10, startColumn: 8, endLine: 10, endColumn: 7 },
      }),
    ).toThrow();
    expect(() =>
      findingResource({ type: "sourceCode", location: { startLine: 10, endColumn: 2 } }),
    ).toThrow();
    expect(() => findingResource({ type: "sourceCode", file: "../../secret.txt" })).toThrow();
    expect(() => findingResource({ type: "sourceCode", file: "/absolute/path" })).toThrow();
  });

  it("uses npm normalization and an extensible fallback registry", () => {
    expect(findingResource({ type: "package", ecosystem: "cargo", name: "Crate_Name" })).toEqual({
      type: "package",
      ecosystem: "cargo",
      name: "Crate_Name",
    });

    registerPackageNameNormalizer("maven", (name) => name.toLowerCase().replaceAll(":", "/"));
    expect(findingResource({ type: "package", ecosystem: "Maven", name: "Org:Library" })).toEqual({
      type: "package",
      ecosystem: "maven",
      name: "org/library",
    });
    expect(() =>
      findingResource({ type: "package", ecosystem: "npm", name: "bad/name" }),
    ).toThrow();
  });

  it("allows OCI tags and digests as resource fields without asset-name restrictions", () => {
    expect(
      observationResource({
        type: "containerImage",
        registry: "localhost:5000",
        repository: "team/service",
        digest: "sha256:abcdef",
        tag: "Release_2026.01",
      }),
    ).toEqual({
      type: "containerImage",
      registry: "localhost:5000",
      repository: "team/service",
      digest: "sha256:abcdef",
      tag: "Release_2026.01",
    });
  });

  it("validates split OCI registry and repository fields independently", () => {
    expect(
      findingResource({
        type: "containerImage",
        registry: "REGISTRY.EXAMPLE.COM:05000",
        repository: "Other.Example.com/Team/App",
      }),
    ).toEqual({
      type: "containerImage",
      registry: "registry.example.com:5000",
      repository: "other.example.com/team/app",
    });

    expect(() => findingResource({ type: "containerImage", registry: "bad_name" })).toThrow();
    expect(() =>
      findingResource({
        type: "containerImage",
        repository: "registry.example.com:5000/team/app",
      }),
    ).toThrow();
  });
});
