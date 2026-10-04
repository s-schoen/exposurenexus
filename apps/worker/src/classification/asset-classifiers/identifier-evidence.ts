import { assetIdentifierSchema } from "@exposurenexus/backend/assets";
import { AffectedResourceType } from "@exposurenexus/contracts/model/affected-resource";
import { AssetIdentifierType } from "@exposurenexus/contracts/model/asset-identifier";

import type { ObservationAffectedResource } from "@exposurenexus/contracts/model/affected-resource";
import type { AssetIdentifier } from "@exposurenexus/contracts/model/asset-identifier";

/**
 * Identity narrowed by identifier structure but not complete enough for an exact
 * lookup. An absent `namespace` admits every namespace, including global scope.
 */
export type PartialIdentity =
  /** The same type and value in any namespace; a null candidate namespace may be unknown. */
  | { kind: "unscoped"; type: AssetIdentifierType; value: string }
  /** A single-label DNS name: the same name or any hostname whose first label it is. */
  | { kind: "hostLabel"; label: string; namespace?: string }
  /** An OCI repository path without its registry. */
  | { kind: "imagePath"; path: string; namespace?: string }
  /** A VCS repository path without its server. */
  | { kind: "repositoryPath"; path: string }
  /** An AWS-local resource ID with optional scope; the service is known only for recognized formats. */
  | { kind: "awsResource"; resource: string; service?: string; region?: string; account?: string };

/** One piece of subject identity: an exact identifier, partial fallback readings, or both. */
export type IdentityEvidence = {
  identifier: AssetIdentifier | null;
  partials: PartialIdentity[];
};

// Lets server-less repository paths reuse VCS path canonicalization without inventing a server.
const placeholderVcsServer = "example.invalid";

// AWS-local resource formats whose prefix implies the ARN service. Unlisted formats
// leave the service open; ambiguity across services still abstains.
const awsServicesByResourcePrefix: readonly (readonly [prefix: string, service: string])[] = [
  ["log-group:", "logs"],
  ["function:", "lambda"],
  ["table/", "dynamodb"],
  ["secret:", "secretsmanager"],
];

/** Evidence for one explicit canonical identifier, including its partial readings. */
export function identifierEvidence(identifier: AssetIdentifier): IdentityEvidence {
  const namespace = identifier.namespace ?? undefined;
  const partials: PartialIdentity[] = [];

  if (identifier.namespace === null) {
    partials.push({ kind: "unscoped", type: identifier.type, value: identifier.value });
  }
  if (identifier.type === AssetIdentifierType.DnsName && !identifier.value.includes(".")) {
    partials.push({ kind: "hostLabel", label: identifier.value, namespace });
  }
  if (
    identifier.type === AssetIdentifierType.OciImageName &&
    splitImageName(identifier.value).registry === null
  ) {
    partials.push({ kind: "imagePath", path: identifier.value, namespace });
  }

  return { identifier, partials };
}

/**
 * Identity carried by typed affected-resource fields. Package names, file paths, and
 * display names are never identity; derived identifiers have no known namespace.
 */
export function affectedResourceEvidence(
  resource: ObservationAffectedResource,
): IdentityEvidence[] {
  switch (resource.type) {
    case AffectedResourceType.WebEndpoint:
    case AffectedResourceType.NetworkService:
      return hostEvidence(resource.host);
    case AffectedResourceType.SourceCode:
      return repositoryEvidence(resource.repository);
    case AffectedResourceType.ContainerImage:
      return imageEvidence(resource.registry, resource.repository);
    case AffectedResourceType.CloudResource:
      return cloudEvidence(
        resource.provider,
        resource.providerAccount,
        resource.region,
        resource.resourceId,
      );
    case AffectedResourceType.Package:
    case AffectedResourceType.Unspecified:
      return [];
  }
}

/** Splits a canonical OCI image name using the canonicalizer's registry rule. */
export function splitImageName(value: string): { registry: string | null; path: string } {
  const separator = value.indexOf("/");
  if (separator === -1 || !isHostLike(value.slice(0, separator))) {
    return { registry: null, path: value };
  }
  return { registry: value.slice(0, separator), path: value.slice(separator + 1) };
}

function hostEvidence(host: string | undefined): IdentityEvidence[] {
  if (host === undefined) {
    return [];
  }
  const bare = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
  const identifier =
    canonicalize(AssetIdentifierType.IpAddress, bare) ??
    canonicalize(AssetIdentifierType.DnsName, bare);
  return identifier === null ? [] : [identifierEvidence(identifier)];
}

function repositoryEvidence(repository: string | undefined): IdentityEvidence[] {
  if (repository === undefined) {
    return [];
  }

  const first = repository.split("/", 1)[0];
  if (first.includes(":") || first.includes("@") || isHostLike(first)) {
    const identifier = canonicalize(AssetIdentifierType.VcsRepository, repository);
    return identifier === null ? [] : [identifierEvidence(identifier)];
  }

  // The canonicalizer would read the first segment of `owner/name` as a host.
  const placeholder = canonicalize(
    AssetIdentifierType.VcsRepository,
    `${placeholderVcsServer}/${repository}`,
  );
  const path = placeholder?.value.slice(placeholderVcsServer.length + 1);
  // A bare repository name is a generic software name, not partial identity.
  if (path === undefined || !path.includes("/")) {
    return [];
  }
  return [{ identifier: null, partials: [{ kind: "repositoryPath", path }] }];
}

function imageEvidence(
  registry: string | undefined,
  repository: string | undefined,
): IdentityEvidence[] {
  // A registry with a path would silently become part of the repository.
  if (repository === undefined || registry?.includes("/")) {
    return [];
  }
  const name = registry === undefined ? repository : `${registry}/${repository}`;
  const identifier = canonicalize(AssetIdentifierType.OciImageName, name);
  return identifier === null ? [] : [identifierEvidence(identifier)];
}

function cloudEvidence(
  provider: string | undefined,
  account: string | undefined,
  region: string | undefined,
  resourceId: string | undefined,
): IdentityEvidence[] {
  const resource = resourceId?.trim();
  // Wildcards and templates describe policies or patterns, not one resource.
  if (resource === undefined || resource.length === 0 || /[*?]|\$\{/u.test(resource)) {
    return [];
  }

  const aws = nonBlank(provider)?.toLowerCase() === "aws";
  const scope = { region: nonBlank(region), account: nonBlank(account) };

  if (resource.startsWith("arn:")) {
    const [, partition = "", , arnRegion, arnAccount] = resource.split(":");
    // Context fields that contradict the ARN make the whole context unusable.
    if (
      (nonBlank(provider) !== undefined && !aws && partition.startsWith("aws")) ||
      (scope.region !== undefined && scope.region !== arnRegion) ||
      (scope.account !== undefined && scope.account !== arnAccount)
    ) {
      return [];
    }
  } else if (aws) {
    const service = awsServicesByResourcePrefix.find(([prefix]) =>
      resource.startsWith(prefix),
    )?.[1];
    return [{ identifier: null, partials: [{ kind: "awsResource", resource, service, ...scope }] }];
  }

  const identifier = canonicalize(AssetIdentifierType.CloudResourceId, resource);
  return identifier === null ? [] : [identifierEvidence(identifier)];
}

function canonicalize(type: AssetIdentifierType, value: string): AssetIdentifier | null {
  const parsed = assetIdentifierSchema.safeParse({ type, namespace: null, value });
  return parsed.success ? parsed.data : null;
}

function isHostLike(segment: string): boolean {
  return (
    segment.includes(".") ||
    segment.includes(":") ||
    segment.startsWith("[") ||
    segment.toLowerCase() === "localhost"
  );
}

function nonBlank(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
}
