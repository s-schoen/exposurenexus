import type { ObservationCandidate } from "./classifier.js";
import type { Logger } from "pino";

/**
 * A completed matching decision for one candidate, not an operational failure.
 *
 * Explanations are operator-readable, log-safe summaries, never raw scanner
 * evidence or metadata. Callers branch on status and reason, not explanation text.
 */
export type FindingMatchResult =
  | {
      status: "matched";
      /** ID of a verified existing finding on the batch's asset, in any status. */
      findingId: string;
      explanation: string;
    }
  | {
      status: "new";
      /**
       * Opaque, batch-local key compared only for equality. Every candidate sharing
       * a key seeds one new finding. A key never appears on a matched decision.
       */
      group: string;
      explanation: string;
    }
  | {
      status: "unresolved";
      reason:
        /** Too little identity evidence to decide between an existing finding and a new one. */
        | "insufficient_evidence"
        /** Multiple plausible targets remain, whether existing findings or an existing finding and a new group. */
        | "ambiguous"
        /** Identity evidence points at different findings. */
        | "conflicting_evidence";
      explanation: string;
    };

/**
 * Resolves the candidates of one ingestion on one asset to existing findings,
 * new finding groups, or explicit abstentions. Concrete implementations belong in
 * ./finding-classifiers/ and receive read-only finding dependencies and
 * implementation-specific configuration at construction.
 */
export interface FindingMatcher {
  /**
   * Accepts trusted classifier output whose asset was resolved by asset matching.
   * The batch holds all candidates of one ingestion that resolved to assetId and
   * must not be chunked; two calls for the same asset and ingestion are a caller
   * bug. Candidates, including all nested data, must not be mutated. Matching never
   * creates or mutates findings, observations, or assets.
   *
   * Only findings on assetId may be selected. All of them are eligible regardless
   * of status or origin, including terminal statuses and manually created
   * findings. Several candidates may match the same finding. A new decision is a
   * positive decision on sufficient identity evidence, not a fallback for inability
   * to decide. Title or description similarity alone is insufficient evidence.
   *
   * Decisions reflect a point-in-time read and reserve nothing. Implementations
   * validate their external responses and verify that a returned findingId refers
   * to an existing finding on assetId before reporting a match.
   *
   * @param assetId ID of the existing asset the candidates were matched to.
   * @param candidates All candidates of one ingestion on assetId, treated as read-only.
   * @param logger Logger for matcher-owned messages.
   * @returns One completed decision per candidate, index-aligned with candidates,
   * each with a log-safe explanation.
   * @throws An error for operational failures such as finding store outages or
   * external service timeouts; these reject the promise for the whole batch rather
   * than return unresolved or partial results.
   */
  match(
    assetId: string,
    candidates: readonly ObservationCandidate[],
    logger: Logger,
  ): Promise<FindingMatchResult[]>;
}
