import { assetIdentifierSchema } from "@exposurenexus/backend/assets";
import { weaknessSchema } from "@exposurenexus/backend/findings";

import type { ObservationAffectedResource } from "@exposurenexus/contracts/model/affected-resource";
import type { AssetIdentifier } from "@exposurenexus/contracts/model/asset-identifier";
import type { VulnerabilitySeverity } from "@exposurenexus/contracts/model/vulnerability";
import type { Weakness } from "@exposurenexus/contracts/model/weakness";
import type { Logger } from "pino";

/**
 * A normalized detection proposal produced from one scanner source record.
 */
export type ObservationCandidate = {
  source: string;
  /**
   * Parser-defined locator for the originating record within one source file.
   * Not cross-scan identity; candidates from the same record share it.
   */
  sourceRecord: string;
  /** Short human-readable summary of the detection. */
  title: string;
  /** Source-provided description, or `null` when the source reports none. */
  description: string | null;
  /** Source-provided remediation guidance, or `null` when absent. */
  remediation: string | null;
  /** Source-provided supporting evidence, or `null` when absent. */
  evidence: string | null;
  /** Severity reported by the source; unknown severity maps to `info`. */
  severity: VulnerabilitySeverity;
  /** Underlying security problem, with scanner-specific identifiers namespaced. */
  weakness: Weakness;
  /** Typed part of the affected subject, or `unspecified` when no narrower detail is known. */
  affectedResource: ObservationAffectedResource;
  /** Time the source observed the detection, or `null` when missing or invalid. */
  observedAt: Date | null;
  /**
   * Canonical external identifiers describing the affected subject.
   */
  assetIdentifierCandidates: AssetIdentifier[];
  /**
   * Source-owned structured context preserved verbatim for provenance,
   * including fields that were mapped onto candidate fields and optional
   * values that could not be normalized.
   */
  sourceMetadata: Record<string, unknown>;
};

export interface Normalizer {
  /**
   * Parses one whole source file.
   *
   * @param scanData Raw bytes of the source record.
   * @param logger Logger for parser-owned messages.
   * @returns Candidates in source order; empty when the source reports nothing.
   * @throws An ordinary, log-safe `Error` when the source cannot be parsed.
   */
  normalize(scanData: Uint8Array, logger: Logger): Promise<ObservationCandidate[]>;
}

export class Classifier {
  private readonly normalizers: Map<string, Normalizer>;
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.normalizers = new Map<string, Normalizer>();
    this.logger = logger;
  }

  /**
   * Registers the normalizer for a scanner source.
   *
   * @throws An `Error` when a normalizer for `source` is already registered.
   */
  public registerNormalizer(source: string, normalizer: Normalizer) {
    if (this.normalizers.has(source)) {
      throw new Error("duplicate normalizer for source " + source);
    }

    this.normalizers.set(source, normalizer);
  }

  /**
   * Normalizes one source file into canonical observation candidates.
   *
   * Candidates whose weakness or asset identifiers cannot be canonicalized are
   * logged and skipped; order and duplicates are otherwise preserved.
   *
   * @param source Registered scanner source key used to select a normalizer.
   * @param scanData Raw bytes of the source file.
   * @returns Canonical candidates, possibly empty.
   * @throws An `Error` when no normalizer is registered for `source`, or the
   * parser throws.
   */
  public async normalize(source: string, scanData: Uint8Array): Promise<ObservationCandidate[]> {
    const normalizer = this.normalizers.get(source);

    if (normalizer === undefined) {
      throw new Error(`no normalizer available for source ${source}`);
    }

    this.logger.debug(`using normalizer for source ${source} to parse ${scanData.length} bytes`);

    const parsed = await normalizer.normalize(scanData, this.logger);
    const candidates: ObservationCandidate[] = [];

    for (const candidate of parsed) {
      const weakness = weaknessSchema.safeParse(candidate.weakness);
      const assetIdentifiers = assetIdentifierSchema
        .array()
        .safeParse(candidate.assetIdentifierCandidates);

      if (!weakness.success || !assetIdentifiers.success) {
        this.logger.warn({ source }, "skipping observation candidate with invalid identifiers");
        continue;
      }

      candidates.push({
        ...candidate,
        weakness: weakness.data,
        assetIdentifierCandidates: assetIdentifiers.data,
        source: source,
      });
    }

    return candidates;
  }
}
