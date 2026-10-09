import { buildIngestionPlan } from "./plan.js";

import type { AssetMatcher } from "../classification/asset-matcher.js";
import type { Classifier, ObservationCandidate } from "../classification/classifier.js";
import type { FindingMatcher } from "../classification/finding-matcher.js";
import type { MatchedBatch } from "./plan.js";
import type { Ingestions } from "@exposurenexus/backend/ingestions";
import type { Logger } from "pino";

/** Failure code recorded when an ingestion's source file cannot be normalized. */
export const parseFailedCode = "ingestion.parse_failed";

export interface IngestionPipelineDependencies {
  ingestions: Pick<Ingestions, "process" | "fail" | "record">;
  classifier: Pick<Classifier, "normalize">;
  /** Creates the asset matcher for one ingestion, over one point-in-time inventory read. */
  createAssetMatcher(): AssetMatcher;
  findingMatcher: FindingMatcher;
}

export interface IngestionPipeline {
  /**
   * Processes one ingestion from its stored source file through to a recorded plan.
   *
   * An ingestion that is no longer `pending` is left alone. A source file that cannot be
   * normalized fails the ingestion with {@link parseFailedCode}. Unresolved candidates are
   * logged and dropped.
   *
   * @throws Operational failures, such as storage, database or matcher errors, and a plan
   * gone stale since matching, so the delivery is retried.
   */
  run(ingestionId: string, logger: Logger): Promise<void>;
}

type UnresolvedCounts = Record<"asset" | "finding", Record<string, number>>;

export function createIngestionPipeline(
  dependencies: IngestionPipelineDependencies,
): IngestionPipeline {
  const { ingestions, classifier, findingMatcher } = dependencies;

  return {
    async run(ingestionId, parentLogger) {
      const logger = parentLogger.child({ ingestionId });
      const { ingestion, data } = await ingestions.process(ingestionId);
      if (ingestion.status !== "pending") {
        logger.info({ status: ingestion.status }, "ingestion already processed");
        return;
      }

      let candidates: ObservationCandidate[];
      try {
        candidates = await classifier.normalize(ingestion.source, data);
      } catch (error) {
        // Normalizer errors are log-safe by contract.
        const reason = error instanceof Error ? error.message : undefined;
        const outcome = await ingestions.fail(ingestionId, parseFailedCode);
        if (outcome.status === "already_processed") {
          logger.info("ingestion already processed");
        } else {
          logger.warn({ failureCode: parseFailedCode, reason }, "ingestion failed");
        }
        return;
      }

      const unresolved: UnresolvedCounts = { asset: {}, finding: {} };
      function drop(
        stage: keyof UnresolvedCounts,
        candidate: ObservationCandidate,
        decision: { reason: string; explanation: string },
      ) {
        unresolved[stage][decision.reason] = (unresolved[stage][decision.reason] ?? 0) + 1;
        logger.warn(
          {
            sourceRecord: candidate.sourceRecord,
            stage,
            reason: decision.reason,
            explanation: decision.explanation,
          },
          "observation candidate unresolved",
        );
      }

      const assetMatcher = dependencies.createAssetMatcher();
      // Insertion order keeps both assets and their candidates in source order.
      const candidatesByAsset = new Map<string, ObservationCandidate[]>();
      for (const candidate of candidates) {
        const decision = await assetMatcher.match(candidate, logger);
        if (decision.status === "unresolved") {
          drop("asset", candidate, decision);
          continue;
        }
        const batch = candidatesByAsset.get(decision.assetId);
        if (batch) batch.push(candidate);
        else candidatesByAsset.set(decision.assetId, [candidate]);
      }

      const batches: MatchedBatch[] = [];
      for (const [assetId, batch] of candidatesByAsset) {
        const decisions = await findingMatcher.match(assetId, batch, logger);
        if (decisions.length !== batch.length) {
          throw new Error("finding matcher returned decisions not aligned with its candidates");
        }
        decisions.forEach((decision, index) => {
          if (decision.status === "unresolved") drop("finding", batch[index], decision);
        });
        batches.push({ assetId, candidates: batch, decisions });
      }

      const recorded = await ingestions.record(ingestionId, buildIngestionPlan(ingestion, batches));
      if (recorded.status === "already_processed") {
        logger.info("ingestion already processed");
        return;
      }
      logger.info(
        {
          candidates: candidates.length,
          newFindings: recorded.createdFindingIds.length,
          attachedObservations: recorded.attachedObservations,
          reopenedFindings: recorded.reopenedFindingIds.length,
          unresolved,
        },
        "ingestion completed",
      );
    },
  };
}
