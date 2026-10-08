import { fingerprintsSchema, weaknessSchema } from "@exposurenexus/backend/findings";
import { findingAffectedResourceSchema } from "@exposurenexus/contracts/model/affected-resource";
import { FindingStatus } from "@exposurenexus/contracts/model/finding";

import { locationFingerprint, resourceIdentity } from "./resource-identity.js";

import type { ResourceIdentity } from "./resource-identity.js";
import type { FindingAffectedResource } from "@exposurenexus/contracts/model/affected-resource";
import type { ObservationFingerprints } from "@exposurenexus/contracts/model/observation";
import type { Weakness } from "@exposurenexus/contracts/model/weakness";

/** One existing finding, in any status and of any origin, as identity evidence. */
export type FindingIdentity = {
  id: string;
  assetId: string;
  status: FindingStatus;
  createdAt: Date;
  weakness: Weakness;
  affectedResource: FindingAffectedResource;
  /** Canonical source fingerprints of all the finding's observations, merged per namespace. */
  fingerprints: ObservationFingerprints;
};

/** Weakness and resource identity of a candidate or an existing finding. */
export type Identity = { weakness: Weakness; resource: ResourceIdentity };

/** An indexed finding with its canonical resource identity. */
export type KnownFinding = Identity & { finding: FindingIdentity };

/** Log-safe error for finding data that violates identity invariants. */
export const invalidFindingResponse = "Invalid finding identity response.";

const statuses = new Set<string>(Object.values(FindingStatus));

function key(namespace: string, value: string) {
  return JSON.stringify([namespace, value]);
}

function append(map: Map<string, KnownFinding[]>, entryKey: string, entry: KnownFinding) {
  const entries = map.get(entryKey);
  if (entries === undefined) {
    map.set(entryKey, [entry]);
  } else {
    entries.push(entry);
  }
}

function isValid(assetId: string, finding: FindingIdentity) {
  if (
    typeof finding !== "object" ||
    finding === null ||
    typeof finding.id !== "string" ||
    finding.id.length === 0 ||
    finding.assetId !== assetId ||
    !statuses.has(finding.status) ||
    !(finding.createdAt instanceof Date) ||
    Number.isNaN(finding.createdAt.getTime()) ||
    !findingAffectedResourceSchema.safeParse(finding.affectedResource).success
  ) {
    return false;
  }

  // Lookups compare canonical values, so non-canonical data would silently miss.
  const weakness = weaknessSchema.safeParse(finding.weakness);
  const fingerprints = fingerprintsSchema.safeParse(finding.fingerprints);
  return (
    weakness.success &&
    JSON.stringify(weakness.data.identifiers) === JSON.stringify(finding.weakness.identifiers) &&
    fingerprints.success &&
    JSON.stringify(fingerprints.data) === JSON.stringify(finding.fingerprints)
  );
}

/**
 * Checks one point-in-time read of an asset's findings against the identity invariants.
 *
 * @throws An `Error` when a finding belongs to another asset, repeats an ID, or carries an
 * invalid status, creation time, or affected resource, or non-canonical weakness
 * identifiers or fingerprints.
 */
export function assertFindingIdentities(assetId: string, findings: readonly FindingIdentity[]) {
  if (!Array.isArray(findings)) {
    throw new Error(invalidFindingResponse);
  }
  const ids = new Set<string>();
  for (const finding of findings) {
    if (!isValid(assetId, finding) || ids.has(finding.id)) {
      throw new Error(invalidFindingResponse);
    }
    ids.add(finding.id);
  }
}

/**
 * Read-only lookup structures over one point-in-time read of an asset's findings.
 *
 * @throws An `Error` when the findings violate {@link assertFindingIdentities}.
 */
export class FindingIndex {
  private readonly byFingerprint = new Map<string, KnownFinding[]>();
  private readonly byLocation = new Map<string, KnownFinding[]>();
  private readonly byIdentifier = new Map<string, KnownFinding[]>();

  constructor(assetId: string, findings: readonly FindingIdentity[]) {
    assertFindingIdentities(assetId, findings);
    for (const finding of findings) {
      const entry: KnownFinding = {
        finding,
        weakness: finding.weakness,
        resource: resourceIdentity(finding.affectedResource),
      };
      for (const [namespace, values] of Object.entries(finding.fingerprints)) {
        for (const value of values) {
          append(this.byFingerprint, key(namespace, value), entry);
        }
      }
      const location = locationFingerprint(finding.affectedResource);
      if (location !== undefined) {
        append(this.byLocation, location, entry);
      }
      for (const [namespace, values] of Object.entries(finding.weakness.identifiers)) {
        for (const value of values) {
          append(this.byIdentifier, key(namespace, value), entry);
        }
      }
    }
  }

  /**
   * Findings whose observations share a source fingerprint within its namespace, or whose
   * source code resource has the same location fingerprint.
   *
   * @returns The findings and the namespaces that hit, `location` for a location fingerprint.
   */
  public fingerprinted(
    fingerprints: ObservationFingerprints,
    location: string | undefined,
  ): { findings: KnownFinding[]; labels: string[] } {
    const findings = new Set<KnownFinding>();
    const labels: string[] = [];
    const collect = (label: string, hits: readonly KnownFinding[] | undefined) => {
      if (hits !== undefined && hits.length > 0) {
        hits.forEach((hit) => findings.add(hit));
        if (!labels.includes(label)) {
          labels.push(label);
        }
      }
    };

    for (const [namespace, values] of Object.entries(fingerprints)) {
      for (const value of values) {
        collect(namespace, this.byFingerprint.get(key(namespace, value)));
      }
    }
    if (location !== undefined) {
      collect("location", this.byLocation.get(location));
    }
    return { findings: [...findings], labels };
  }

  /** Findings sharing any weakness identifier, CWE included, within its namespace. */
  public sharingIdentifiers(weakness: Weakness): KnownFinding[] {
    const findings = new Set<KnownFinding>();
    for (const [namespace, values] of Object.entries(weakness.identifiers)) {
      for (const value of values) {
        this.byIdentifier.get(key(namespace, value))?.forEach((hit) => findings.add(hit));
      }
    }
    return [...findings];
  }
}
