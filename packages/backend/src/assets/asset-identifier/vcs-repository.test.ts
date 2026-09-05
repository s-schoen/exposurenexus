import {
  AssetIdentifierType,
  AssetIdentifierValidationReason,
} from "@exposurenexus/contracts/model/asset-identifier";
import { describe, expect, it } from "vitest";

import { validateAssetIdentifier, vcsRepositoryValueSchema } from "./schema.js";

function validationResult(value: string) {
  return validateAssetIdentifier({
    type: AssetIdentifierType.VcsRepository,
    value,
  });
}

describe("VCS repository value schema", () => {
  it.each([
    ["github.com/Org/Repo", "github.com/Org/Repo"],
    ["https://github.com/Org/Repo.git", "github.com/Org/Repo"],
    ["http://github.com/Org/Repo", "github.com/Org/Repo"],
    ["ssh://git@github.com/Org/Repo.git", "github.com/Org/Repo"],
    ["git@GitHub.com:Org/Repo.git", "github.com/Org/Repo"],
    ["github.com:2222/Org/Repo", "github.com:2222/Org/Repo"],
    ["https://github.com:443/Org/Repo", "github.com/Org/Repo"],
    ["http://github.com:80/Org/Repo", "github.com/Org/Repo"],
    ["ssh://git@github.com:22/Org/Repo", "github.com/Org/Repo"],
    ["ssh://git@[2001:0DB8::1]:2222/Org/Repo.git", "[2001:db8::1]:2222/Org/Repo"],
    ["git@[2001:0DB8::1]:Org/Repo.git", "[2001:db8::1]/Org/Repo"],
    ["https://192.0.2.1/Org/Repo.git", "192.0.2.1/Org/Repo"],
    ["https://BÜCHER.Example/Org/Repo", "xn--bcher-kva.example/Org/Repo"],
    ["github.com/Org/Repo.git/Component.git", "github.com/Org/Repo.git/Component"],
    ["gitlab.com/group/subgroup/tree/repo", "gitlab.com/group/subgroup/tree/repo"],
  ])("normalizes %j to %j", (value, expected) => {
    expect(vcsRepositoryValueSchema.parse(value)).toBe(expected);
  });

  it("omits SSH usernames from the canonical identity", () => {
    expect(vcsRepositoryValueSchema.parse("ssh://alice@github.com/Org/Repo")).toBe(
      vcsRepositoryValueSchema.parse("ssh://bob@github.com/Org/Repo"),
    );
  });

  it("preserves nondefault ports and repository path case", () => {
    expect(vcsRepositoryValueSchema.parse("github.com:2222/Org/Repo")).toBe(
      "github.com:2222/Org/Repo",
    );
    expect(vcsRepositoryValueSchema.parse("github.com/org/repo")).not.toBe(
      vcsRepositoryValueSchema.parse("github.com/Org/Repo"),
    );
  });

  it("normalizes the same repository idempotently", () => {
    const normalized = vcsRepositoryValueSchema.parse("ssh://git@GitHub.com/Org/Repo.git");

    expect(vcsRepositoryValueSchema.parse(normalized)).toBe(normalized);
  });

  it.each([
    [
      "",
      AssetIdentifierValidationReason.Empty,
      "empty",
      "VCS repository identifiers must not be empty.",
    ],
    [
      "github.com/Org Repo",
      AssetIdentifierValidationReason.InvalidFormat,
      "vcs_whitespace",
      "VCS repository identifiers must not contain whitespace or control characters.",
    ],
    [
      "github.com/Org/\u0000Repo",
      AssetIdentifierValidationReason.InvalidFormat,
      "vcs_whitespace",
      "VCS repository identifiers must not contain whitespace or control characters.",
    ],
    [
      "https://github.com/Org/Repo?ref=main",
      AssetIdentifierValidationReason.InvalidFormat,
      "vcs_query",
      "VCS repository identifiers must not contain query strings or fragments.",
    ],
    [
      "https://github.com/Org/Repo#main",
      AssetIdentifierValidationReason.InvalidFormat,
      "vcs_query",
      "VCS repository identifiers must not contain query strings or fragments.",
    ],
    [
      "git://github.com/Org/Repo",
      AssetIdentifierValidationReason.InvalidFormat,
      "vcs_scheme",
      "VCS repository identifiers support SSH and HTTP(S) forms only.",
    ],
    [
      "https://",
      AssetIdentifierValidationReason.InvalidFormat,
      "vcs_url",
      "VCS repository URLs must be valid.",
    ],
    [
      "https://user:password@github.com/Org/Repo",
      AssetIdentifierValidationReason.InvalidFormat,
      "vcs_credentials",
      "HTTP(S) VCS repository URLs must not contain credentials.",
    ],
    [
      "https://user@github.com/Org/Repo",
      AssetIdentifierValidationReason.InvalidFormat,
      "vcs_credentials",
      "HTTP(S) VCS repository URLs must not contain credentials.",
    ],
    [
      "ssh://git:password@github.com/Org/Repo",
      AssetIdentifierValidationReason.InvalidFormat,
      "vcs_credentials",
      "VCS repository URLs must not contain passwords.",
    ],
    [
      "[not-an-ip]/Org/Repo",
      AssetIdentifierValidationReason.InvalidFormat,
      "vcs_server",
      "VCS repository servers must use valid host syntax.",
    ],
    [
      "github.com:0/Org/Repo",
      AssetIdentifierValidationReason.InvalidFormat,
      "vcs_port",
      "VCS repository ports must be valid TCP ports.",
    ],
    [
      "github.com:65536/Org/Repo",
      AssetIdentifierValidationReason.InvalidFormat,
      "vcs_port",
      "VCS repository ports must be valid TCP ports.",
    ],
    [
      "github.com",
      AssetIdentifierValidationReason.InvalidFormat,
      "vcs_repository_path",
      "VCS repository identifiers must include a server and repository path.",
    ],
    [
      "github.com/",
      AssetIdentifierValidationReason.InvalidFormat,
      "vcs_repository_path",
      "VCS repositories must include a valid repository path.",
    ],
    [
      "github.com//Org/Repo",
      AssetIdentifierValidationReason.InvalidFormat,
      "vcs_repository_path",
      "VCS repositories must include a valid repository path.",
    ],
    [
      "github.com/Org\\Repo",
      AssetIdentifierValidationReason.InvalidFormat,
      "vcs_repository_path",
      "VCS repositories must include a valid repository path.",
    ],
    [
      "github.com/Org/%52epo",
      AssetIdentifierValidationReason.InvalidFormat,
      "vcs_repository_path",
      "VCS repositories must include a valid repository path.",
    ],
    [
      "github.com/Org/./Repo",
      AssetIdentifierValidationReason.InvalidFormat,
      "vcs_repository_path",
      "VCS repositories must not contain empty or relative path segments.",
    ],
    [
      "https://github.com/Org/Repo/../Other",
      AssetIdentifierValidationReason.InvalidFormat,
      "vcs_repository_path",
      "VCS repositories must not contain relative path segments.",
    ],
    [
      "github.com/.git",
      AssetIdentifierValidationReason.InvalidFormat,
      "vcs_repository_path",
      "VCS repositories must include a repository path.",
    ],
    [
      "https://github.com/Org/Repo/tree/main",
      AssetIdentifierValidationReason.InvalidFormat,
      "vcs_ref",
      "VCS repository identifiers must not contain refs.",
    ],
    [
      "https://bitbucket.org/Org/Repo/src/main",
      AssetIdentifierValidationReason.InvalidFormat,
      "vcs_ref",
      "VCS repository identifiers must not contain refs.",
    ],
    [
      "https://gitlab.com/Group/Repo/-/tree/main",
      AssetIdentifierValidationReason.InvalidFormat,
      "vcs_ref",
      "VCS repository identifiers must not contain refs.",
    ],
    [
      "git.example.com/Group/Repo/tree/main",
      AssetIdentifierValidationReason.InvalidFormat,
      "vcs_ref",
      "VCS repository identifiers must not contain refs.",
    ],
  ] as const)("rejects invalid repository %j", (value, reason, detail, message) => {
    expect(validationResult(value)).toEqual({
      success: false,
      issues: [{ path: ["value"], reason, detail, message }],
    });
  });

  it("accepts a repository port at both valid boundaries", () => {
    expect(vcsRepositoryValueSchema.parse("github.com:1/Org/Repo")).toBe("github.com:1/Org/Repo");
    expect(vcsRepositoryValueSchema.parse("github.com:65535/Org/Repo")).toBe(
      "github.com:65535/Org/Repo",
    );
  });

  it("accepts a normalized value at the maximum Unicode length", () => {
    const value = `github.com/${"😀".repeat(2037)}`;

    expect(vcsRepositoryValueSchema.parse(value)).toBe(value);
  });

  it("rejects values beyond the normalized length limit", () => {
    expect(validationResult(`github.com/${"😀".repeat(2038)}`)).toEqual({
      success: false,
      issues: [
        {
          path: ["value"],
          reason: AssetIdentifierValidationReason.TooLong,
          detail: "vcs_value",
          message: "Identifier values must be at most 2048 characters long.",
        },
      ],
    });
  });
});
