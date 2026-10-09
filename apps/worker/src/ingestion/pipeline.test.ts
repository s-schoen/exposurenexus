import { ApplicationError } from "@exposurenexus/backend";
import { AffectedResourceType } from "@exposurenexus/contracts/model/affected-resource";
import { VulnerabilitySeverity } from "@exposurenexus/contracts/model/vulnerability";
import { describe, expect, it, vi } from "vitest";

import { recordingLogger } from "../test/logger.js";
import { createIngestionPipeline, parseFailedCode } from "./pipeline.js";

import type { AssetMatchResult } from "../classification/asset-matcher.js";
import type { ObservationCandidate } from "../classification/classifier.js";
import type { FindingMatchResult } from "../classification/finding-matcher.js";
import type {
  IngestionPlan,
  IngestionStatus,
  ProcessedIngestion,
  RecordedIngestion,
} from "@exposurenexus/backend/ingestions";

const ingestionId = "11111111-1111-4111-8111-111111111111";
const createdAt = new Date("2026-10-08T12:00:00.000Z");
const assetA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const assetB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const findingId = "ffffffff-ffff-4fff-8fff-ffffffffffff";

function candidate(sourceRecord: string, fields: Partial<ObservationCandidate> = {}) {
  return {
    source: "trivy",
    sourceRecord,
    title: `Detection ${sourceRecord}`,
    description: null,
    remediation: null,
    evidence: null,
    severity: VulnerabilitySeverity.Medium,
    weakness: { identifiers: { cve: ["CVE-2026-0001"] } },
    affectedResource: { type: AffectedResourceType.Unspecified },
    observedAt: null,
    assetIdentifierCandidates: [],
    fingerprints: {},
    sourceMetadata: { secret: "raw scanner metadata" },
    ...fields,
  } satisfies ObservationCandidate;
}

function processed(status: IngestionStatus = "pending"): ProcessedIngestion {
  return {
    ingestion: {
      id: ingestionId,
      source: "trivy",
      createdBy: "22222222-2222-4222-8222-222222222222",
      createdAt,
      status,
    },
    importSourceId: "33333333-3333-4333-8333-333333333333",
    data: new Uint8Array([1, 2, 3]),
  };
}

/**
 * Wires the pipeline to fake ports. Asset and finding decisions are keyed by source record;
 * candidates without a finding decision seed a new finding of their own.
 */
function setup(
  candidates: ObservationCandidate[],
  assets: Record<string, AssetMatchResult>,
  findings: Record<string, FindingMatchResult> = {},
) {
  const logger = recordingLogger({ jobId: "job" });
  const ingestions = {
    process: vi.fn(async (_id: string) => processed()),
    fail: vi.fn(
      async (_id: string, _code: string): Promise<{ status: "failed" | "already_processed" }> => ({
        status: "failed",
      }),
    ),
    record: vi.fn(async (_id: string, _plan: IngestionPlan): Promise<RecordedIngestion> => ({
      status: "recorded",
      createdFindingIds: ["44444444-4444-4444-8444-444444444444"],
      attachedObservations: 2,
      reopenedFindingIds: [findingId],
    })),
  };
  const classifier = { normalize: vi.fn(async () => candidates) };
  const assetMatcher = {
    match: vi.fn(async (candidate: ObservationCandidate) => assets[candidate.sourceRecord]),
  };
  const findingMatcher = {
    match: vi.fn(async (_assetId: string, batch: readonly ObservationCandidate[]) =>
      batch.map(
        ({ sourceRecord }): FindingMatchResult =>
          findings[sourceRecord] ?? { status: "new", group: sourceRecord, explanation: "new" },
      ),
    ),
  };
  const createAssetMatcher = vi.fn(() => assetMatcher);
  const pipeline = createIngestionPipeline({
    ingestions,
    classifier,
    createAssetMatcher,
    findingMatcher,
  });
  return {
    logger,
    ingestions,
    classifier,
    assetMatcher,
    findingMatcher,
    createAssetMatcher,
    run: () => pipeline.run(ingestionId, logger),
  };
}

const onAsset = (assetId: string): AssetMatchResult => ({
  status: "matched",
  assetId,
  explanation: "Exact identifier match.",
});

describe("ingestion pipeline", () => {
  it("records the plan built from both matching stages and logs one summary", async () => {
    const candidates = [candidate("r0", { observedAt: null }), candidate("r1")];
    const f = setup(
      candidates,
      { r0: onAsset(assetA), r1: onAsset(assetA) },
      { r1: { status: "matched", findingId, explanation: "Fingerprint match." } },
    );

    await f.run();

    expect(f.classifier.normalize).toHaveBeenCalledExactlyOnceWith("trivy", processed().data);
    expect(f.createAssetMatcher).toHaveBeenCalledOnce();
    expect(f.ingestions.record).toHaveBeenCalledExactlyOnceWith(ingestionId, {
      newFindings: [
        {
          assetId: assetA,
          finding: expect.objectContaining({ title: "Detection r0" }),
          observations: [expect.objectContaining({ title: "Detection r0", observedAt: createdAt })],
        },
      ],
      attachments: [
        {
          findingId,
          assetId: assetA,
          observations: [expect.objectContaining({ title: "Detection r1" })],
        },
      ],
    });
    expect(f.ingestions.fail).not.toHaveBeenCalled();
    expect(f.logger.entries).toEqual([
      {
        level: "info",
        fields: {
          jobId: "job",
          ingestionId,
          candidates: 2,
          newFindings: 1,
          attachedObservations: 2,
          reopenedFindings: 1,
          unresolved: { asset: {}, finding: {} },
        },
        message: "ingestion completed",
      },
    ]);
  });

  it.each(["completed", "failed"] as const)("skips an already %s ingestion", async (status) => {
    const f = setup([], {});
    f.ingestions.process.mockResolvedValueOnce(processed(status));

    await f.run();

    expect(f.ingestions.process).toHaveBeenCalledExactlyOnceWith(ingestionId);
    expect(f.classifier.normalize).not.toHaveBeenCalled();
    expect(f.createAssetMatcher).not.toHaveBeenCalled();
    expect(f.ingestions.fail).not.toHaveBeenCalled();
    expect(f.ingestions.record).not.toHaveBeenCalled();
    expect(f.logger.entries).toEqual([
      {
        level: "info",
        fields: { jobId: "job", ingestionId, status },
        message: "ingestion already processed",
      },
    ]);
  });

  it("fails the ingestion without rejecting when the source cannot be parsed", async () => {
    const f = setup([], {});
    f.classifier.normalize.mockRejectedValueOnce(new Error("trivy: invalid JSON"));

    await expect(f.run()).resolves.toBeUndefined();

    expect(f.ingestions.fail).toHaveBeenCalledExactlyOnceWith(ingestionId, parseFailedCode);
    expect(parseFailedCode).toBe("ingestion.parse_failed");
    expect(f.createAssetMatcher).not.toHaveBeenCalled();
    expect(f.ingestions.record).not.toHaveBeenCalled();
    expect(f.logger.entries).toEqual([
      {
        level: "warn",
        fields: {
          jobId: "job",
          ingestionId,
          failureCode: "ingestion.parse_failed",
          reason: "trivy: invalid JSON",
        },
        message: "ingestion failed",
      },
    ]);
  });

  it("acknowledges a parse failure for an ingestion another delivery already processed", async () => {
    const f = setup([], {});
    f.classifier.normalize.mockRejectedValueOnce(new Error("trivy: invalid JSON"));
    f.ingestions.fail.mockResolvedValueOnce({ status: "already_processed" });

    await expect(f.run()).resolves.toBeUndefined();

    expect(f.logger.entries).toEqual([
      {
        level: "info",
        fields: { jobId: "job", ingestionId },
        message: "ingestion already processed",
      },
    ]);
  });

  it("drops and logs asset- and finding-unresolved candidates", async () => {
    const candidates = [candidate("r0"), candidate("r1"), candidate("r2"), candidate("r3")];
    const f = setup(
      candidates,
      {
        r0: {
          status: "unresolved",
          reason: "no_match",
          explanation: "No inventory asset carries these identifiers.",
        },
        r1: onAsset(assetA),
        r2: onAsset(assetA),
        r3: { status: "unresolved", reason: "no_match", explanation: "No match." },
      },
      {
        r1: {
          status: "unresolved",
          reason: "ambiguous",
          explanation: "Two findings are equally plausible.",
        },
      },
    );

    await f.run();

    expect(f.findingMatcher.match).toHaveBeenCalledExactlyOnceWith(
      assetA,
      [candidates[1], candidates[2]],
      expect.anything(),
    );
    const plan = f.ingestions.record.mock.calls[0][1];
    expect(plan.newFindings.map(({ finding }) => finding.title)).toEqual(["Detection r2"]);
    expect(plan.attachments).toEqual([]);
    const warnings = f.logger.entries.filter(({ level }) => level === "warn");
    expect(warnings).toEqual([
      {
        level: "warn",
        fields: {
          jobId: "job",
          ingestionId,
          sourceRecord: "r0",
          stage: "asset",
          reason: "no_match",
          explanation: "No inventory asset carries these identifiers.",
        },
        message: "observation candidate unresolved",
      },
      expect.objectContaining({ fields: expect.objectContaining({ sourceRecord: "r3" }) }),
      {
        level: "warn",
        fields: {
          jobId: "job",
          ingestionId,
          sourceRecord: "r1",
          stage: "finding",
          reason: "ambiguous",
          explanation: "Two findings are equally plausible.",
        },
        message: "observation candidate unresolved",
      },
    ]);
    expect(JSON.stringify(f.logger.entries)).not.toContain("raw scanner metadata");
    expect(f.logger.entries.at(-1)).toEqual({
      level: "info",
      fields: expect.objectContaining({
        candidates: 4,
        unresolved: { asset: { no_match: 2 }, finding: { ambiguous: 1 } },
      }),
      message: "ingestion completed",
    });
  });

  it("calls the finding matcher once per asset with all its candidates in source order", async () => {
    const candidates = [candidate("r0"), candidate("r1"), candidate("r2"), candidate("r3")];
    const f = setup(candidates, {
      r0: onAsset(assetB),
      r1: onAsset(assetA),
      r2: onAsset(assetB),
      r3: onAsset(assetA),
    });

    await f.run();

    expect(f.assetMatcher.match.mock.calls.map(([{ sourceRecord }]) => sourceRecord)).toEqual([
      "r0",
      "r1",
      "r2",
      "r3",
    ]);
    expect(f.createAssetMatcher).toHaveBeenCalledOnce();
    expect(f.findingMatcher.match.mock.calls.map(([assetId, batch]) => [assetId, batch])).toEqual([
      [assetB, [candidates[0], candidates[2]]],
      [assetA, [candidates[1], candidates[3]]],
    ]);
  });

  it("records an empty plan when the source reports nothing", async () => {
    const f = setup([], {});

    await f.run();

    expect(f.findingMatcher.match).not.toHaveBeenCalled();
    expect(f.ingestions.record).toHaveBeenCalledExactlyOnceWith(ingestionId, {
      newFindings: [],
      attachments: [],
    });
  });

  it("acknowledges an ingestion another delivery recorded first", async () => {
    const f = setup([], {});
    f.ingestions.record.mockResolvedValueOnce({ status: "already_processed" });

    await f.run();

    expect(f.logger.entries).toEqual([
      {
        level: "info",
        fields: { jobId: "job", ingestionId },
        message: "ingestion already processed",
      },
    ]);
  });

  it.each([
    ["loading the source", "process"],
    ["matching assets", "asset"],
    ["matching findings", "finding"],
    ["recording the plan", "record"],
  ] as const)("rejects without failing the ingestion when %s fails", async (_stage, port) => {
    const f = setup([candidate("r0")], { r0: onAsset(assetA) });
    const failure = new Error("connection refused");
    if (port === "process") f.ingestions.process.mockRejectedValueOnce(failure);
    if (port === "asset") f.assetMatcher.match.mockRejectedValueOnce(failure);
    if (port === "finding") f.findingMatcher.match.mockRejectedValueOnce(failure);
    if (port === "record") f.ingestions.record.mockRejectedValueOnce(failure);

    await expect(f.run()).rejects.toBe(failure);

    expect(f.ingestions.fail).not.toHaveBeenCalled();
    expect(f.logger.entries).not.toContainEqual(
      expect.objectContaining({ message: "ingestion completed" }),
    );
  });

  it("rejects a plan gone stale since matching so the delivery is retried", async () => {
    const f = setup([candidate("r0")], { r0: onAsset(assetA) });
    const stale = new ApplicationError({
      code: "ingestion.plan_stale",
      kind: "conflict",
      message: "Ingestion plan no longer matches the stored assets and findings",
      details: { ingestionId },
    });
    f.ingestions.record.mockRejectedValueOnce(stale);

    await expect(f.run()).rejects.toBe(stale);

    expect(f.ingestions.fail).not.toHaveBeenCalled();
  });

  it("rejects finding decisions that are not index-aligned with the batch", async () => {
    const f = setup([candidate("r0"), candidate("r1")], {
      r0: onAsset(assetA),
      r1: onAsset(assetA),
    });
    f.findingMatcher.match.mockResolvedValueOnce([
      { status: "new", group: "g", explanation: "new" },
    ]);

    await expect(f.run()).rejects.toThrow("not aligned");

    expect(f.ingestions.record).not.toHaveBeenCalled();
    expect(f.ingestions.fail).not.toHaveBeenCalled();
  });
});
