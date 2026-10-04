import type { ObservationCandidate } from "./classifier.js";
import type { Logger } from "pino";

/**
 * A completed matching decision, not an operational failure.
 *
 * Explanations are operator-readable, log-safe summaries, never raw scanner
 * evidence or metadata. Callers branch on status and reason, not explanation text.
 */
export type AssetMatchResult =
  | {
      status: "matched";
      /** ID of a verified existing inventory asset, active or archived. */
      assetId: string;
      explanation: string;
    }
  | {
      status: "unresolved";
      reason:
        /** Too little evidence to meaningfully identify a target. */
        | "insufficient_evidence"
        /** Sufficient identifying evidence was evaluated, but no suitable asset was found. */
        | "no_match"
        /** Multiple plausible assets remain without conflicting known identifiers. */
        | "ambiguous"
        /** Canonical identifiers resolve to different inventory assets. */
        | "conflicting_identifiers";
      explanation: string;
    };

/**
 * Resolves one normalized candidate to an existing asset or explicitly abstains.
 * Concrete implementations belong in ./asset-classifiers/ and receive read-only
 * inventory dependencies and implementation-specific configuration at construction.
 */
export interface AssetMatcher {
  /**
   * Accepts trusted classifier output with canonical identifiers. The candidate,
   * including all nested data, and inventory must not be mutated. Matching never
   * creates assets or adds identifiers to them.
   *
   * Contextual inference is allowed without an exact identifier match, but display
   * name similarity alone is insufficient. Archived assets remain eligible.
   * Canonical identifiers resolving to different assets require an unresolved
   * conflicting_identifiers result. If known identifiers resolve to only one
   * asset, select that asset or abstain, never another asset. Additional identifiers
   * with no inventory match do not automatically veto that asset.
   *
   * Implementations validate their external responses and verify that a returned
   * assetId refers to an existing inventory asset before reporting a match.
   *
   * @param candidate One normalized observation candidate, treated as read-only.
   * @param logger Logger for matcher-owned messages.
   * @returns A completed matching decision with a log-safe explanation.
   * @throws An error for operational failures such as inventory outages or external
   * service timeouts; these reject the promise rather than return unresolved.
   */
  match(candidate: ObservationCandidate, logger: Logger): Promise<AssetMatchResult>;
}
