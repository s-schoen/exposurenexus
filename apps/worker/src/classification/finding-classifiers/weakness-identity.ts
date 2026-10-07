import type { Weakness } from "@exposurenexus/contracts/model/weakness";

/**
 * How two canonical weaknesses relate as finding identity evidence.
 *
 * - `same`: they share a specific namespace, and every shared specific namespace overlaps.
 * - `related`: one side has nothing more specific than a CWE, and their CWEs overlap.
 * - `none`: no comparable evidence links them.
 */
export type WeaknessRelation = "same" | "related" | "none";

/** CWE names a weakness category; every other namespace names one specific weakness. */
const categoryNamespace = "cwe";

function overlaps(left: readonly string[] | undefined, right: readonly string[] | undefined) {
  return left !== undefined && right !== undefined && left.some((value) => right.includes(value));
}

/** Namespaces other than CWE holding at least one identifier, such as cve, ghsa, or a rule ID. */
export function specificNamespaces(weakness: Weakness): string[] {
  return Object.keys(weakness.identifiers).filter(
    (namespace) =>
      namespace !== categoryNamespace && (weakness.identifiers[namespace]?.length ?? 0) > 0,
  );
}

/**
 * Relates two canonical weaknesses. A CWE is consulted only when one side has no
 * specific identifier, so broad categories never link two specific weaknesses.
 *
 * @returns The relation and, for log-safe explanations, the namespaces that decided it.
 */
export function compareWeakness(
  left: Weakness,
  right: Weakness,
): { relation: WeaknessRelation; namespaces: string[] } {
  const leftSpecific = specificNamespaces(left);
  const rightSpecific = specificNamespaces(right);
  const shared = leftSpecific.filter((namespace) => rightSpecific.includes(namespace));

  if (shared.length > 0) {
    // A disagreeing namespace, such as another nuclei matcher, names a different weakness.
    return shared.every((namespace) =>
      overlaps(left.identifiers[namespace], right.identifiers[namespace]),
    )
      ? { relation: "same", namespaces: shared }
      : { relation: "none", namespaces: [] };
  }

  if (
    (leftSpecific.length === 0 || rightSpecific.length === 0) &&
    overlaps(left.identifiers[categoryNamespace], right.identifiers[categoryNamespace])
  ) {
    return { relation: "related", namespaces: [categoryNamespace] };
  }

  return { relation: "none", namespaces: [] };
}
