import { describe, expect, it } from "vitest";

import {
  AssetIdentifierType,
  AssetIdentifierValidationReason,
  ociImageNameValueSchema,
  validateAssetIdentifier,
} from "../asset-identifier.js";

function validationResult(value: string) {
  return validateAssetIdentifier({
    type: AssetIdentifierType.OciImageName,
    value,
  });
}

describe("OCI image name value schema", () => {
  it.each([
    ["nginx", "nginx"],
    ["Library/NGINX", "library/nginx"],
    ["library/my_image.name", "library/my_image.name"],
    ["team/app-name__v1.2", "team/app-name__v1.2"],
    ["REGISTRY.Example.com/Team/App", "registry.example.com/team/app"],
    ["BÜCHER.Example/Team/App", "xn--bcher-kva.example/team/app"],
    ["localhost/Team/App", "localhost/team/app"],
    ["LOCALHOST:05000/Team/App", "localhost:5000/team/app"],
    ["192.0.2.1:05000/Team/App", "192.0.2.1:5000/team/app"],
    ["[2001:0DB8::1]/Team/App", "[2001:db8::1]/team/app"],
    ["[2001:0DB8::1]:05000/Team/App", "[2001:db8::1]:5000/team/app"],
  ])("normalizes %j to %j", (value, expected) => {
    expect(ociImageNameValueSchema.parse(value)).toBe(expected);
  });

  it("keeps registryless and qualified image identities distinct", () => {
    expect(ociImageNameValueSchema.parse("nginx")).not.toBe(
      ociImageNameValueSchema.parse("docker.io/library/nginx"),
    );
    expect(ociImageNameValueSchema.parse("library/nginx")).not.toBe(
      ociImageNameValueSchema.parse("nginx"),
    );
  });

  it("normalizes the same image name idempotently", () => {
    const normalized = ociImageNameValueSchema.parse("REGISTRY.Example.com/Team/App");

    expect(ociImageNameValueSchema.parse(normalized)).toBe(normalized);
  });

  it.each([
    ["", AssetIdentifierValidationReason.Empty, "empty", "OCI image names must not be empty."],
    [
      "https://docker.io/library/nginx",
      AssetIdentifierValidationReason.InvalidFormat,
      "oci_scheme",
      "OCI image names must not contain a scheme.",
    ],
    [
      "docker.io/library/nginx?tag=latest",
      AssetIdentifierValidationReason.InvalidFormat,
      "oci_syntax",
      "OCI image names must not contain URLs or whitespace.",
    ],
    [
      "docker.io/library/nginx%2Flatest",
      AssetIdentifierValidationReason.InvalidFormat,
      "oci_syntax",
      "OCI image names must not contain URLs or whitespace.",
    ],
    [
      "docker.io/library/nginx@sha256:abcd",
      AssetIdentifierValidationReason.InvalidFormat,
      "oci_digest",
      "OCI image names must not contain digests.",
    ],
    [
      "nginx:latest",
      AssetIdentifierValidationReason.InvalidFormat,
      "oci_tag",
      "OCI image names must not contain tags.",
    ],
    [
      "docker.io/library/nginx:latest",
      AssetIdentifierValidationReason.InvalidFormat,
      "oci_tag",
      "OCI image names must not contain tags.",
    ],
    [
      "library//nginx",
      AssetIdentifierValidationReason.InvalidFormat,
      "oci_repository",
      "OCI image names must not contain empty path components.",
    ],
    [
      "registry.example.com",
      AssetIdentifierValidationReason.InvalidFormat,
      "oci_registry",
      "Qualified OCI image names must include a repository path.",
    ],
    [
      "registry.example.com:/repo",
      AssetIdentifierValidationReason.InvalidFormat,
      "oci_registry",
      "OCI registry ports must not be empty.",
    ],
    [
      "localhost:0/repo",
      AssetIdentifierValidationReason.InvalidFormat,
      "oci_registry",
      "OCI registry ports must be valid TCP ports.",
    ],
    [
      "localhost:65536/repo",
      AssetIdentifierValidationReason.InvalidFormat,
      "oci_registry",
      "OCI registry ports must be valid TCP ports.",
    ],
    [
      "localhost:abc/repo",
      AssetIdentifierValidationReason.InvalidFormat,
      "oci_registry",
      "OCI registry ports must be valid TCP ports.",
    ],
    [
      "[2001:db8::1]:0/repo",
      AssetIdentifierValidationReason.InvalidFormat,
      "oci_registry",
      "OCI registry ports must be valid TCP ports.",
    ],
    [
      "[not-an-ip]/repo",
      AssetIdentifierValidationReason.InvalidFormat,
      "oci_registry",
      "OCI registries must use valid host syntax.",
    ],
    [
      "library/repo_",
      AssetIdentifierValidationReason.InvalidFormat,
      "oci_repository",
      "OCI image names must use valid lowercase repository components.",
    ],
    [
      "library/repo...",
      AssetIdentifierValidationReason.InvalidFormat,
      "oci_repository",
      "OCI image names must use valid lowercase repository components.",
    ],
    [
      "docker.io/library/\u0000nginx",
      AssetIdentifierValidationReason.InvalidFormat,
      "oci_syntax",
      "OCI image names must not contain URLs or whitespace.",
    ],
  ] as const)("rejects invalid OCI name %j", (value, reason, detail, message) => {
    expect(validationResult(value)).toEqual({
      success: false,
      issues: [{ path: ["value"], reason, detail, message }],
    });
  });

  it("accepts a registry port at both valid boundaries", () => {
    expect(ociImageNameValueSchema.parse("localhost:1/repo")).toBe("localhost:1/repo");
    expect(ociImageNameValueSchema.parse("localhost:65535/repo")).toBe("localhost:65535/repo");
  });

  it("accepts a normalized value at the maximum Unicode length", () => {
    const value = "a".repeat(2048);

    expect(ociImageNameValueSchema.parse(value)).toBe(value);
  });

  it("rejects values beyond the normalized length limit", () => {
    expect(validationResult("a".repeat(2049))).toEqual({
      success: false,
      issues: [
        {
          path: ["value"],
          reason: AssetIdentifierValidationReason.TooLong,
          detail: "oci_value",
          message: "Identifier values must be at most 2048 characters long.",
        },
      ],
    });
  });
});
