import { AffectedResourceType } from "@exposurenexus/contracts/model/affected-resource";

import type {
  FindingAffectedResource,
  ObservationAffectedResource,
} from "@exposurenexus/contracts/model/affected-resource";

/**
 * How two affected resources relate as finding identity evidence.
 *
 * - `exact`: same type, same identity fields, equal values.
 * - `compatible`: same type, the minimum fields agree, no field known on both sides differs,
 *   and some field is known on only one side.
 * - `different`: anything else, including a minimum field missing on either side.
 */
export type ResourceRelation = "exact" | "compatible" | "different";

/** Canonical identity fields of one affected resource; a missing field is unknown, never empty. */
export type ResourceIdentity = {
  type: AffectedResourceType;
  fields: Readonly<Partial<Record<string, string>>>;
};

/** Fields without which a resource of a type cannot identify a finding. */
const minimumFields: Record<AffectedResourceType, readonly string[]> = {
  [AffectedResourceType.Unspecified]: [],
  [AffectedResourceType.WebEndpoint]: ["host"],
  [AffectedResourceType.NetworkService]: ["host"],
  [AffectedResourceType.SourceCode]: ["file"],
  [AffectedResourceType.Package]: ["name"],
  [AffectedResourceType.ContainerImage]: ["repository"],
  [AffectedResourceType.CloudResource]: ["resourceId"],
};

const defaultPorts = new Map([
  ["http", 80],
  ["https", 443],
  ["ws", 80],
  ["wss", 443],
]);

function text(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed === "" ? undefined : trimmed;
}

function lower(value: string | undefined) {
  return text(value)?.toLowerCase();
}

function host(value: string | undefined) {
  return lower(value)?.replace(/^\[(.*)\]$/u, "$1");
}

function path(value: string | undefined) {
  return text(
    text(value)
      ?.replaceAll("\\", "/")
      .replace(/^(?:\.\/)+/u, ""),
  );
}

function known(entries: Record<string, string | number | undefined>) {
  const fields: Partial<Record<string, string>> = {};
  for (const [field, value] of Object.entries(entries)) {
    if (value !== undefined) {
      fields[field] = String(value);
    }
  }
  return fields;
}

/**
 * Reads the finding-owned identity of an affected resource. Observation-only snapshot
 * fields such as a package version are never read, and values are canonicalized only
 * for comparison. A source code location fingerprint is fingerprint evidence, not part
 * of this identity.
 */
export function resourceIdentity(
  resource: ObservationAffectedResource | FindingAffectedResource,
): ResourceIdentity {
  switch (resource.type) {
    case AffectedResourceType.Unspecified:
      return { type: resource.type, fields: {} };
    case AffectedResourceType.WebEndpoint: {
      const scheme = lower(resource.scheme);
      return {
        type: resource.type,
        fields: known({
          scheme,
          host: host(resource.host),
          port: resource.port ?? (scheme === undefined ? undefined : defaultPorts.get(scheme)),
          path: text(resource.path),
          method: text(resource.method)?.toUpperCase(),
          componentKind: resource.component?.kind,
          componentName: text(resource.component?.name),
        }),
      };
    }
    case AffectedResourceType.NetworkService:
      return {
        type: resource.type,
        fields: known({
          host: host(resource.host),
          port: resource.port,
          transport: lower(resource.transport),
          protocol: lower(resource.protocol),
        }),
      };
    case AffectedResourceType.SourceCode:
      return {
        type: resource.type,
        fields: known({
          repository: text(resource.repository),
          file: path(resource.file),
          symbol: text(resource.symbol),
          startLine: resource.location?.startLine,
        }),
      };
    case AffectedResourceType.Package:
      return {
        type: resource.type,
        fields: known({
          ecosystem: lower(resource.ecosystem),
          name: text(resource.name),
          installationPath: path(resource.installationPath),
        }),
      };
    case AffectedResourceType.ContainerImage:
      return {
        type: resource.type,
        fields: known({
          registry: lower(resource.registry),
          repository: text(resource.repository),
          digest: lower(resource.digest),
        }),
      };
    case AffectedResourceType.CloudResource:
      return {
        type: resource.type,
        fields: known({
          provider: lower(resource.provider),
          providerAccount: text(resource.providerAccount),
          region: lower(resource.region),
          resourceId: text(resource.resourceId),
          subresource: text(resource.subresource),
        }),
      };
  }
}

/** The location fingerprint of a source code resource, which the finding owns and users may edit. */
export function locationFingerprint(
  resource: ObservationAffectedResource | FindingAffectedResource,
): string | undefined {
  return resource.type === AffectedResourceType.SourceCode
    ? text(resource.locationFingerprint)
    : undefined;
}

/** Minimum identity fields the resource lacks; empty when it can identify a finding. */
export function missingMinimumFields(identity: ResourceIdentity): string[] {
  return minimumFields[identity.type].filter((field) => identity.fields[field] === undefined);
}

function comparableFields(left: ResourceIdentity, right: ResourceIdentity) {
  // A symbol on both sides, such as an IaC resource name, outlasts line shifts.
  if (
    left.type === AffectedResourceType.SourceCode &&
    left.fields.symbol !== undefined &&
    right.fields.symbol !== undefined
  ) {
    const { startLine: _left, ...leftFields } = left.fields;
    const { startLine: _right, ...rightFields } = right.fields;
    return [leftFields, rightFields];
  }
  return [left.fields, right.fields];
}

/** Relates two resource identities; different types never describe one finding. */
export function compareResource(left: ResourceIdentity, right: ResourceIdentity): ResourceRelation {
  if (
    left.type !== right.type ||
    missingMinimumFields(left).length > 0 ||
    missingMinimumFields(right).length > 0
  ) {
    return "different";
  }

  const [leftFields, rightFields] = comparableFields(left, right);
  let partial = false;
  for (const field of new Set([...Object.keys(leftFields), ...Object.keys(rightFields)])) {
    const leftValue = leftFields[field];
    const rightValue = rightFields[field];
    if (leftValue === undefined || rightValue === undefined) {
      partial = true;
    } else if (leftValue !== rightValue) {
      return "different";
    }
  }
  return partial ? "compatible" : "exact";
}
