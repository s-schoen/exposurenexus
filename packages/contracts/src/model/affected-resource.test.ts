import { describe, expect, it } from "vitest";

import {
  AffectedResourceType,
  findingAffectedResourceSchema,
  observationAffectedResourceSchema,
} from "./affected-resource.js";

const findingResource = (resource: unknown) => findingAffectedResourceSchema.parse(resource);
const observationResource = (resource: unknown) =>
  observationAffectedResourceSchema.parse(resource);

describe("affected-resource schemas", () => {
  it("preserves values without applying semantic normalization", () => {
    const resources = [
      { type: AffectedResourceType.Unspecified },
      {
        type: AffectedResourceType.WebEndpoint,
        scheme: "CUSTOM",
        host: "not a host",
        port: -1.5,
        path: "../../admin?debug=true",
        method: "not a method",
        component: { kind: "queryParameter", name: "" },
      },
      {
        type: AffectedResourceType.NetworkService,
        host: "anything",
        port: 99999,
        transport: "custom",
        protocol: "Custom Protocol",
      },
      {
        type: AffectedResourceType.SourceCode,
        repository: "not a repository",
        file: "../../secret.txt",
        location: { startLine: 10, startColumn: 8, endLine: 9, endColumn: 2 },
        locationFingerprint: "anything",
      },
      {
        type: AffectedResourceType.Package,
        ecosystem: "NPM",
        name: "bad/name",
        installationPath: "/absolute/path",
      },
      {
        type: AffectedResourceType.ContainerImage,
        registry: "bad_name",
        repository: "registry.example.com:5000/team/app",
        digest: "anything",
      },
      {
        type: AffectedResourceType.CloudResource,
        provider: "CUSTOM",
        providerAccount: "",
        region: "anything",
        resourceId: "not a resource id",
        subresource: "",
      },
    ];

    for (const resource of resources) {
      expect(findingResource(resource)).toEqual(resource);
    }
  });

  it("accepts partial concrete resources without adding defaults", () => {
    expect(findingResource({ type: "webEndpoint" })).toEqual({ type: "webEndpoint" });
    expect(findingResource({ type: "sourceCode", file: "" })).toEqual({
      type: "sourceCode",
      file: "",
    });
    expect(findingResource({ type: "package", name: "" })).toEqual({
      type: "package",
      name: "",
    });
  });

  it("keeps observation-only source snapshot fields separate", () => {
    expect(
      observationResource({
        type: "webEndpoint",
        reportedUrl: "anything",
      }),
    ).toEqual({ type: "webEndpoint", reportedUrl: "anything" });
    expect(observationResource({ type: "sourceCode", revision: "" })).toEqual({
      type: "sourceCode",
      revision: "",
    });
    expect(observationResource({ type: "package", version: "" })).toEqual({
      type: "package",
      version: "",
    });
    expect(observationResource({ type: "containerImage", tag: "" })).toEqual({
      type: "containerImage",
      tag: "",
    });
    expect(observationResource({ type: "cloudResource", displayName: "" })).toEqual({
      type: "cloudResource",
      displayName: "",
    });

    expect(() => findingResource({ type: "webEndpoint", reportedUrl: "anything" })).toThrow();
    expect(() => findingResource({ type: "sourceCode", revision: "anything" })).toThrow();
    expect(() => findingResource({ type: "package", version: "anything" })).toThrow();
    expect(() => findingResource({ type: "containerImage", tag: "anything" })).toThrow();
    expect(() => findingResource({ type: "cloudResource", displayName: "anything" })).toThrow();
  });

  it("still validates discriminators, field ownership, and primitive types", () => {
    expect(() => findingResource({ type: "unknown" })).toThrow();
    expect(() => findingResource({ type: "asset" })).toThrow();
    expect(() => observationResource({ type: "asset" })).toThrow();
    expect(() => findingResource({ type: "webEndpoint", protocol: "http" })).toThrow();
    expect(() => findingResource({ type: "webEndpoint", port: "443" })).toThrow();
    expect(() => findingResource({ type: "sourceCode", location: { startLine: "1" } })).toThrow();
  });
});
