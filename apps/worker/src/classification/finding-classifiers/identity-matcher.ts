import { FindingStatus } from "@exposurenexus/contracts/model/finding";

import { FindingIndex } from "./finding-index.js";
import {
  compareResource,
  locationFingerprint,
  missingMinimumFields,
  resourceIdentity,
} from "./resource-identity.js";
import { compareWeakness, specificNamespaces } from "./weakness-identity.js";

import type { ObservationCandidate } from "../classifier.js";
import type { FindingMatcher, FindingMatchResult } from "../finding-matcher.js";
import type { FindingIdentity, Identity, KnownFinding } from "./finding-index.js";
import type { Logger } from "pino";

export type { FindingIdentity } from "./finding-index.js";

/** Read-only finding access for {@link IdentityFindingMatcher}. */
export interface FindingIdentitySource {
  /** Every finding on the asset, in any status, imported or manually created. */
  listFindings(assetId: string): Promise<readonly FindingIdentity[]>;
}

type Unresolved = Extract<FindingMatchResult, { status: "unresolved" }>;

/** A candidate's claim on one identity class of existing findings. */
type Claim = {
  status: "claim";
  /** Weak claims rest on partial identity and must be exclusive within the batch. */
  strength: "strong" | "weak";
  members: KnownFinding[];
  evidence: string;
};

type Pending = Claim | { status: "new" } | Unresolved;

function unresolved(reason: Unresolved["reason"], explanation: string): Unresolved {
  return { status: "unresolved", reason, explanation };
}

function sameIdentity(left: Identity, right: Identity) {
  return (
    (compareWeakness(left.weakness, right.weakness).relation === "same" ||
      JSON.stringify(left.weakness.identifiers) === JSON.stringify(right.weakness.identifiers)) &&
    compareResource(left.resource, right.resource) === "exact"
  );
}

function compatibleIdentity(left: Identity, right: Identity) {
  return (
    sameIdentity(left, right) ||
    (compareWeakness(left.weakness, right.weakness).relation === "same" &&
      compareResource(left.resource, right.resource) === "compatible")
  );
}

/** Partitions findings into classes of equal identity, such as a duplicate and its canonical finding. */
function identityClasses(findings: readonly KnownFinding[]): KnownFinding[][] {
  const classes: KnownFinding[][] = [];
  for (const finding of findings) {
    const match = classes.find(([first]) => sameIdentity(first, finding));
    if (match === undefined) {
      classes.push([finding]);
    } else {
      match.push(finding);
    }
  }
  return classes;
}

/** Prefers a non-duplicate finding, then the oldest, then the lowest ID. */
function preference(left: FindingIdentity, right: FindingIdentity) {
  return (
    Number(left.status === FindingStatus.Duplicate) -
      Number(right.status === FindingStatus.Duplicate) ||
    left.createdAt.getTime() - right.createdAt.getTime() ||
    (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
  );
}

function matched({ members, evidence }: Claim): FindingMatchResult {
  const [finding] = members.map((member) => member.finding).sort(preference);
  const target =
    members.length === 1
      ? "one finding"
      : `${members.length} findings with equal identity; preferred a non-duplicate, then the oldest`;
  return {
    status: "matched",
    findingId: finding.id,
    explanation: `${evidence} matched ${target}.`,
  };
}

function list(values: Iterable<string>) {
  return [...new Set(values)].join(", ");
}

/**
 * Deterministic matcher over finding identity: weakness and affected resource on the
 * batch's asset.
 *
 * Source fingerprints and location fingerprints decide first, unless the weakness and
 * resource identify another finding exactly. Exact weakness and resource identity decides
 * next. Partial identity, such as a CWE-only finding or a resource missing an optional
 * field, is consulted only when nothing matched exactly, and only when no other candidate
 * identity in the batch claims the same finding. Unmatched candidates with a specific
 * weakness identifier and a sufficient resource seed new findings, grouped by identity.
 * Titles, descriptions, evidence, and source metadata are never evidence.
 *
 * Every call reads and validates the asset's current findings once, so all decisions in a
 * batch rest on one point-in-time read.
 */
export class IdentityFindingMatcher implements FindingMatcher {
  private readonly findings: FindingIdentitySource;

  constructor(findings: FindingIdentitySource) {
    this.findings = findings;
  }

  public async match(
    assetId: string,
    candidates: readonly ObservationCandidate[],
    logger: Logger,
  ): Promise<FindingMatchResult[]> {
    const index = new FindingIndex(assetId, await this.findings.listFindings(assetId));
    const identities = candidates.map((candidate) => ({
      weakness: candidate.weakness,
      resource: resourceIdentity(candidate.affectedResource),
    }));
    const results = settle(
      candidates.map((candidate, position) => decide(index, candidate, identities[position])),
      identities,
    );
    for (const result of results) {
      logger.debug(result, "finding match decided");
    }
    return results;
  }
}

function decide(index: FindingIndex, candidate: ObservationCandidate, identity: Identity): Pending {
  const type = identity.resource.type;
  const strong: KnownFinding[] = [];
  const strongNamespaces: string[] = [];
  const weak: KnownFinding[] = [];
  const weakKinds: string[] = [];
  for (const known of index.sharingIdentifiers(candidate.weakness)) {
    const weakness = compareWeakness(identity.weakness, known.weakness);
    const resource = compareResource(identity.resource, known.resource);
    if (weakness.relation === "none" || resource === "different") {
      continue;
    }
    if (weakness.relation === "same" && resource === "exact") {
      strong.push(known);
      strongNamespaces.push(...weakness.namespaces);
    } else {
      weak.push(known);
      if (weakness.relation === "related") {
        weakKinds.push("CWE only");
      }
      if (resource === "compatible") {
        weakKinds.push(`incomplete ${type}`);
      }
    }
  }

  const fingerprinted = index.fingerprinted(
    candidate.fingerprints,
    locationFingerprint(candidate.affectedResource),
  );
  if (fingerprinted.findings.length > 0) {
    const evidence = `Fingerprints (${fingerprinted.labels.join(", ")})`;
    const classes = identityClasses(fingerprinted.findings);
    if (classes.length > 1) {
      return unresolved(
        "conflicting_evidence",
        `${evidence} point to ${classes.length} findings with different identities.`,
      );
    }
    const [members] = classes;
    if (strong.some((known) => !members.includes(known) && !sameIdentity(known, members[0]))) {
      return unresolved(
        "conflicting_evidence",
        `${evidence} and weakness (${list(strongNamespaces)}) with ${type} identity point to different findings.`,
      );
    }
    return { status: "claim", strength: "strong", members, evidence };
  }

  if (strong.length > 0) {
    const evidence = `Weakness (${list(strongNamespaces)}) and ${type} identity`;
    const classes = identityClasses(strong);
    if (classes.length > 1) {
      return unresolved(
        "ambiguous",
        `${evidence} fit ${classes.length} findings with different identities.`,
      );
    }
    return { status: "claim", strength: "strong", members: classes[0], evidence };
  }

  if (weak.length > 0) {
    const evidence = `No finding matched exactly; partial identity (${list(weakKinds)})`;
    const classes = identityClasses(weak);
    if (classes.length > 1) {
      return unresolved(
        "ambiguous",
        `${evidence} fits ${classes.length} findings with different identities.`,
      );
    }
    return { status: "claim", strength: "weak", members: classes[0], evidence };
  }

  if (specificNamespaces(candidate.weakness).length === 0) {
    return unresolved(
      "insufficient_evidence",
      Object.keys(candidate.weakness.identifiers).length === 0
        ? "The weakness carries no identifiers."
        : "The weakness carries no identifier more specific than a CWE.",
    );
  }
  const missing = missingMinimumFields(identity.resource);
  if (missing.length > 0) {
    return unresolved(
      "insufficient_evidence",
      `The ${type} resource lacks identity fields (${missing.join(", ")}).`,
    );
  }
  return { status: "new" };
}

/** Applies batch-wide rules: weak claims must be exclusive, and new candidates form groups. */
function settle(
  pending: readonly Pending[],
  identities: readonly Identity[],
): FindingMatchResult[] {
  const results: FindingMatchResult[] = [];
  const fresh: number[] = [];

  pending.forEach((decision, position) => {
    if (decision.status === "new") {
      fresh.push(position);
      return;
    }
    if (decision.status === "unresolved") {
      results[position] = decision;
      return;
    }
    const contested =
      decision.strength === "weak" &&
      pending.some(
        (other, otherPosition) =>
          other.status === "claim" &&
          other.members.some((member) => decision.members.includes(member)) &&
          !sameIdentity(identities[position], identities[otherPosition]),
      );
    results[position] = contested
      ? unresolved(
          "ambiguous",
          `${decision.evidence} fits one finding that another candidate identity in the batch also claims.`,
        )
      : matched(decision);
  });

  for (const [key, members] of groupNew(fresh, identities, results).entries()) {
    const { weakness, resource } = identities[members[0]];
    const peers =
      members.length === 1 ? "" : ` ${members.length} candidates in the batch seed it together.`;
    for (const position of members) {
      results[position] = {
        status: "new",
        group: `new-${key}`,
        explanation: `No finding on the asset matches the weakness (${list(specificNamespaces(weakness))}) and ${resource.type} identity.${peers}`,
      };
    }
  }
  return results;
}

/**
 * Groups new candidates by equal identity, then folds each group into the single other
 * group it is compatible with. A group compatible with several groups is ambiguous, and its
 * results are written directly.
 *
 * @returns The remaining groups as candidate positions.
 */
function groupNew(
  fresh: readonly number[],
  identities: readonly Identity[],
  results: FindingMatchResult[],
): number[][] {
  const groups: number[][] = [];
  for (const position of fresh) {
    const group = groups.find(([first]) => sameIdentity(identities[first], identities[position]));
    if (group === undefined) {
      groups.push([position]);
    } else {
      group.push(position);
    }
  }

  const fits = (left: readonly number[], right: readonly number[]) =>
    left.every((a) => right.every((b) => compatibleIdentity(identities[a], identities[b])));
  const fieldCount = ([first]: readonly number[]) =>
    Object.keys(identities[first].resource.fields).length;
  const remaining = new Set(groups);
  // Less specific groups fold first, so an incomplete identity joins its complete peer.
  for (const group of [...groups].sort((left, right) => fieldCount(left) - fieldCount(right))) {
    const targets = [...remaining].filter((other) => other !== group && fits(group, other));
    if (targets.length === 1) {
      targets[0].push(...group);
      remaining.delete(group);
    } else if (targets.length > 1) {
      remaining.delete(group);
      const { weakness, resource } = identities[group[0]];
      for (const position of group) {
        results[position] = unresolved(
          "ambiguous",
          `The weakness (${list(specificNamespaces(weakness))}) and incomplete ${resource.type} identity fit ${targets.length} new finding groups in the batch.`,
        );
      }
    }
  }
  return groups.filter((group) => remaining.has(group));
}
