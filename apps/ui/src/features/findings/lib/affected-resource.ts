import { AffectedResourceType } from "@exposurenexus/contracts/model/affected-resource";

import type { FindingAffectedResource } from "@exposurenexus/contracts/model/affected-resource";

export function formatResourceType(type: AffectedResourceType) {
  switch (type) {
    case AffectedResourceType.Unspecified:
      return "Unspecified resource";
    case AffectedResourceType.WebEndpoint:
      return "Web endpoint";
    case AffectedResourceType.NetworkService:
      return "Network service";
    case AffectedResourceType.SourceCode:
      return "Source code";
    case AffectedResourceType.Package:
      return "Package";
    case AffectedResourceType.ContainerImage:
      return "Container image";
    case AffectedResourceType.CloudResource:
      return "Cloud resource";
  }
}

type SourceCodeLocation = NonNullable<
  Extract<FindingAffectedResource, { type: AffectedResourceType.SourceCode }>["location"]
>;

function formatLocation(location: SourceCodeLocation) {
  const start = [location.startLine, location.startColumn]
    .filter((value) => value !== undefined)
    .join(":");
  const end = [location.endLine, location.endColumn]
    .filter((value) => value !== undefined)
    .join(":");
  return end ? `${start}-${end}` : start;
}

type ResourceDetailValue = string | number | { kind: string; name?: string } | undefined;

function formatResourceDetails(
  entries: Array<[string, ResourceDetailValue]>,
): Array<[string, string]> {
  const details: Array<[string, string]> = [];

  for (const [label, value] of entries) {
    if (value === undefined) continue;
    if (typeof value === "object") {
      details.push([label, value.name ? `${value.kind}: ${value.name}` : value.kind]);
    } else {
      details.push([label, String(value)]);
    }
  }

  return details;
}

// Resource details that are identifiers or digests, rather than names, render in mono.
const identifierResourceDetails = new Set([
  "Digest",
  "Location fingerprint",
  "Resource ID",
  "Revision",
]);

export function isIdentifierResourceDetail(label: string) {
  return identifierResourceDetails.has(label);
}

/** The recorded identity fields of a finding's affected resource, as label/value pairs. */
export function getResourceDetails(resource: FindingAffectedResource): Array<[string, string]> {
  switch (resource.type) {
    case AffectedResourceType.Unspecified:
      return [];
    case AffectedResourceType.WebEndpoint:
      return formatResourceDetails([
        ["Scheme", resource.scheme],
        ["Host", resource.host],
        ["Port", resource.port],
        ["Path", resource.path],
        ["Method", resource.method],
        ["Component", resource.component],
      ]);
    case AffectedResourceType.NetworkService:
      return formatResourceDetails([
        ["Host", resource.host],
        ["Port", resource.port],
        ["Transport", resource.transport],
        ["Protocol", resource.protocol],
      ]);
    case AffectedResourceType.SourceCode:
      return formatResourceDetails([
        ["Repository", resource.repository],
        ["File", resource.file],
        ["Location", resource.location ? formatLocation(resource.location) : undefined],
        ["Symbol", resource.symbol],
        ["Location fingerprint", resource.locationFingerprint],
      ]);
    case AffectedResourceType.Package:
      return formatResourceDetails([
        ["Ecosystem", resource.ecosystem],
        ["Package", resource.name],
        ["Installation path", resource.installationPath],
      ]);
    case AffectedResourceType.ContainerImage:
      return formatResourceDetails([
        ["Registry", resource.registry],
        ["Repository", resource.repository],
        ["Digest", resource.digest],
      ]);
    case AffectedResourceType.CloudResource:
      return formatResourceDetails([
        ["Provider", resource.provider],
        ["Provider account", resource.providerAccount],
        ["Region", resource.region],
        ["Resource ID", resource.resourceId],
        ["Subresource", resource.subresource],
      ]);
  }
}
