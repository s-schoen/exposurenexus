import { fingerprintsSchema, weaknessSchema } from "@exposurenexus/backend/findings";
import { assetSchema } from "@exposurenexus/contracts/model/asset";
import { findingRecordSchema } from "@exposurenexus/contracts/model/finding";
import { observationSchema } from "@exposurenexus/contracts/model/observation";
import { z } from "zod/v4";

import { percent } from "../command.js";
import {
  assertCanonical,
  candidateSchema,
  uniqueIds,
  validateNote,
  validateTags,
} from "../fixtures.js";
import { evaluateMatchers, ratio } from "../harness.js";

import type { ObservationCandidate } from "../../classifier.js";
import type { FindingMatcher, FindingMatchResult } from "../../finding-matcher.js";
import type {
  CallRun,
  EvaluationDataset,
  EvaluationOptions,
  EvaluationScenario,
  EvaluationSummary,
  MatcherFactory,
  MatcherKind,
} from "../harness.js";
import type { Asset } from "@exposurenexus/contracts/model/asset";
import type { Observation } from "@exposurenexus/contracts/model/observation";

type UnresolvedReason = Extract<FindingMatchResult, { status: "unresolved" }>["reason"];

export type ExpectedFindingMatch =
  /** Any listed finding is correct; tie-breaking among equal identities is the matcher's. */
  | { status: "matched"; findingIds: string[] }
  /** Candidates sharing a label must form exactly one group; labels are fixture-local. */
  | { status: "new"; group: string }
  | { status: "unresolved"; reason: UnresolvedReason };

export type FindingCandidateCase = {
  /** Unique within the batch. */
  id: string;
  candidate: ObservationCandidate;
  /** The correct decision given only the batch's evidence and the existing findings. */
  expected: ExpectedFindingMatch;
  /** Breakdown labels such as `status:mitigated`; `source:` tags are derived. */
  tags?: string[];
};

/** One `FindingMatcher.match` call: every candidate of one ingestion on one asset. */
export type FindingBatchCase = {
  id: string;
  assetId: string;
  candidates: FindingCandidateCase[];
  /** Why the labels are what they are; for reviewers, never scored or reported. */
  note?: string;
};

export type FindingRecord = z.infer<typeof findingRecordSchema>;
/**
 * A persisted observation. The contracts admit only manual observations so far; scanner
 * observations carry their source and ingestion as the pipeline will persist them.
 */
export type EvaluationObservation = Omit<Observation, "source" | "ingestionId"> & {
  source: string;
  /** Null exactly for manual observations. */
  ingestionId: string | null;
};

export type FindingScenario = EvaluationScenario<FindingBatchCase> & {
  assets: Asset[];
  /** Existing findings on any scenario asset, in any status. */
  findings: FindingRecord[];
  observations: EvaluationObservation[];
};
export type FindingDataset = EvaluationDataset<FindingScenario>;
export type FindingFixture = Pick<FindingScenario, "assets" | "findings" | "observations">;
export type FindingMatcherFactory = MatcherFactory<FindingFixture, FindingMatcher>;

type CandidateOutcome =
  | "correct_match"
  | "wrong_match"
  | "missed_match"
  | "correct_new"
  | "wrong_grouping"
  | "unexpected_new"
  | "missed_new"
  | "correctly_unresolved"
  | "incorrect_unresolved_reason"
  | "error"
  | "not_run";

type CandidateEvaluation = {
  id: string;
  tags: string[];
  expected: ExpectedFindingMatch;
  actual: FindingMatchResult | null;
  outcome: CandidateOutcome;
  /** Set when a match broke a hard contract invariant. */
  violation: "other_asset" | "nonexistent_finding" | null;
};

type BatchEvaluation = {
  id: string;
  scenarioId: string;
  assetId: string;
  candidates: CandidateEvaluation[];
  durationMs: number | null;
  error: string | null;
};

const reasons = ["insufficient_evidence", "ambiguous", "conflicting_evidence"] as const;

const resultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("matched"), findingId: z.string(), explanation: z.string() }),
  z.object({ status: z.literal("new"), group: z.string(), explanation: z.string() }),
  z.object({ status: z.literal("unresolved"), reason: z.enum(reasons), explanation: z.string() }),
]) satisfies z.ZodType<FindingMatchResult>;

const expectedSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("matched"), findingIds: z.array(z.string()).nonempty() }),
  z.strictObject({ status: z.literal("new"), group: z.string().trim().min(1) }),
  z.strictObject({ status: z.literal("unresolved"), reason: z.enum(reasons) }),
]);

const observationRecordSchema = observationSchema
  .extend({
    source: z.string().trim().min(1),
    ingestionId: z.uuidv4().nullable(),
    weakness: weaknessSchema,
    fingerprints: fingerprintsSchema,
  })
  .refine(
    (observation) => (observation.source === "manual") === (observation.ingestionId === null),
  );

function validateScenario(scenario: FindingScenario) {
  const assets = uniqueIds(scenario.assets, "asset");
  for (const asset of scenario.assets) {
    assertCanonical(assetSchema, asset, `Invalid asset in scenario ${scenario.id}.`);
  }
  uniqueIds(scenario.findings, "finding");
  const findings = new Map(scenario.findings.map((finding) => [finding.id, finding]));
  for (const finding of scenario.findings) {
    const context = `${scenario.id}/${finding.id}`;
    assertCanonical(findingRecordSchema, finding, `Invalid finding in ${context}.`);
    assertCanonical(weaknessSchema, finding.weakness, `Noncanonical weakness in ${context}.`);
    if (!assets.has(finding.assetId)) {
      throw new Error(`Finding asset is not in the scenario for ${context}.`);
    }
  }
  uniqueIds(scenario.observations, "observation");
  for (const observation of scenario.observations) {
    const context = `${scenario.id}/${observation.id}`;
    assertCanonical(
      observationRecordSchema,
      observation,
      `Invalid or noncanonical observation in ${context}.`,
    );
    if (!findings.has(observation.findingId)) {
      throw new Error(`Observation finding is not in the scenario for ${context}.`);
    }
  }
  for (const batch of scenario.cases) {
    const batchContext = `${scenario.id}/${batch.id}`;
    if (!assets.has(batch.assetId)) {
      throw new Error(`Batch asset is not in the scenario for ${batchContext}.`);
    }
    if (!Array.isArray(batch.candidates) || batch.candidates.length === 0) {
      throw new Error(`Batch ${batchContext} has no candidates.`);
    }
    uniqueIds(batch.candidates, "candidate");
    validateNote(batch.note, batchContext);
    for (const entry of batch.candidates) {
      const context = `${batchContext}/${entry.id}`;
      assertCanonical(
        candidateSchema,
        entry.candidate,
        `Invalid or noncanonical observation candidate in ${context}.`,
      );
      assertCanonical(expectedSchema, entry.expected, `Invalid expected outcome in ${context}.`);
      if (entry.expected.status === "matched") {
        const targets = entry.expected.findingIds;
        if (new Set(targets).size !== targets.length) {
          throw new Error(`Duplicate expected findings in ${context}.`);
        }
        if (targets.some((id) => findings.get(id)?.assetId !== batch.assetId)) {
          throw new Error(`Expected finding is not on the batch asset for ${context}.`);
        }
      }
      validateTags(entry.tags, context);
    }
  }
}

function parse(result: unknown, batch: FindingBatchCase) {
  const parsed = z.array(resultSchema).safeParse(result);
  return parsed.success && parsed.data.length === batch.candidates.length ? parsed.data : undefined;
}

/** Indices of the candidates that share a new-group key with candidate `index`. */
function groupMembers(decisions: Array<{ status: string; group?: string }>, index: number) {
  const { group } = decisions[index];
  return decisions.flatMap((decision, other) =>
    decision.status === "new" && decision.group === group ? [other] : [],
  );
}

function outcomeFor(
  expected: ExpectedFindingMatch[],
  actual: FindingMatchResult[],
  index: number,
): CandidateOutcome {
  const want = expected[index];
  const got = actual[index];
  if (got.status === "matched") {
    return want.status === "matched" && want.findingIds.includes(got.findingId)
      ? "correct_match"
      : "wrong_match";
  }
  if (got.status === "new") {
    if (want.status !== "new") return "unexpected_new";
    // Group keys are opaque, so compare which candidates share a group, not the keys.
    const wanted = groupMembers(expected, index);
    const formed = groupMembers(actual, index);
    return wanted.length === formed.length && wanted.every((member, at) => member === formed[at])
      ? "correct_new"
      : "wrong_grouping";
  }
  if (want.status === "matched") return "missed_match";
  if (want.status === "new") return "missed_new";
  return got.reason === want.reason ? "correctly_unresolved" : "incorrect_unresolved_reason";
}

function score(
  scenario: FindingScenario,
  batch: FindingBatchCase,
  run: CallRun<FindingMatchResult[]>,
): BatchEvaluation {
  const expected = batch.candidates.map((entry) => entry.expected);
  return {
    id: batch.id,
    scenarioId: scenario.id,
    assetId: batch.assetId,
    candidates: batch.candidates.map((entry, index) => {
      const actual = run.result?.[index] ?? null;
      const finding =
        actual?.status === "matched"
          ? scenario.findings.find((candidate) => candidate.id === actual.findingId)
          : undefined;
      return {
        id: entry.id,
        tags: [...new Set([`source:${entry.candidate.source}`, ...(entry.tags ?? [])])],
        expected: entry.expected,
        actual,
        outcome:
          run.status === "not_run"
            ? "not_run"
            : run.result === null
              ? "error"
              : outcomeFor(expected, run.result, index),
        violation:
          actual?.status !== "matched"
            ? null
            : finding === undefined
              ? "nonexistent_finding"
              : finding.assetId !== batch.assetId
                ? "other_asset"
                : null,
      };
    }),
    durationMs: run.durationMs,
    error: run.error,
  };
}

const correctOutcomes = new Set<CandidateOutcome>([
  "correct_match",
  "correct_new",
  "correctly_unresolved",
]);

function decisionLabel(entry: CandidateEvaluation) {
  switch (entry.actual?.status) {
    case undefined:
      return entry.outcome;
    case "unresolved":
      return entry.actual.reason;
    case "matched":
      return entry.outcome === "correct_match" ? "matched" : "matched:other";
    case "new":
      return entry.outcome === "wrong_grouping" ? "new:regrouped" : "new";
  }
}

function summarize(batches: BatchEvaluation[]) {
  const candidates = batches.flatMap((batch) =>
    batch.candidates.map((entry) => ({ ...entry, path: `${batch.scenarioId}/${batch.id}` })),
  );
  const count = (keep: (entry: CandidateEvaluation) => boolean) => candidates.filter(keep).length;
  const outcome = (value: CandidateOutcome) => count((entry) => entry.outcome === value);
  const correctMatches = outcome("correct_match");
  const wrongMatches = outcome("wrong_match");
  const correctNew = outcome("correct_new");
  const wrongGroupings = outcome("wrong_grouping");
  const unexpectedNew = outcome("unexpected_new");
  const expectedMatches = count((entry) => entry.expected.status === "matched");
  const expectedNew = count((entry) => entry.expected.status === "new");

  // Expected decision -> actual decision, counted per candidate.
  const confusion: Record<string, Record<string, number>> = {};
  const tags: Record<string, { candidates: number; correct: number; wrongMatches: number }> = {};
  const failures: string[] = [];
  for (const entry of candidates) {
    const expected =
      entry.expected.status === "unresolved" ? entry.expected.reason : entry.expected.status;
    confusion[expected] ??= {};
    const actual = decisionLabel(entry);
    confusion[expected][actual] = (confusion[expected][actual] ?? 0) + 1;

    const correct = correctOutcomes.has(entry.outcome);
    for (const tag of entry.tags) {
      const stats = (tags[tag] ??= { candidates: 0, correct: 0, wrongMatches: 0 });
      stats.candidates += 1;
      if (correct) stats.correct += 1;
      if (entry.outcome === "wrong_match") stats.wrongMatches += 1;
    }
    if (!correct && entry.outcome !== "not_run") failures.push(`${entry.path}/${entry.id}`);
  }

  return {
    batches: batches.length,
    candidates: candidates.length,
    expectedMatches,
    expectedNew,
    correctMatches,
    wrongMatches,
    missedMatches: outcome("missed_match"),
    correctNew,
    wrongGroupings,
    unexpectedNew,
    missedNew: outcome("missed_new"),
    correctlyUnresolved: outcome("correctly_unresolved"),
    incorrectUnresolvedReasons: outcome("incorrect_unresolved_reason"),
    errors: outcome("error"),
    notRun: outcome("not_run"),
    /** Matches on another asset's finding; a hard contract violation. */
    otherAssetMatches: count((entry) => entry.violation === "other_asset"),
    /** Matches on finding IDs that do not exist; a hard contract violation. */
    nonexistentMatches: count((entry) => entry.violation === "nonexistent_finding"),
    matchPrecision: ratio(correctMatches, correctMatches + wrongMatches),
    matchRecall: ratio(correctMatches, expectedMatches),
    newPrecision: ratio(correctNew, correctNew + wrongGroupings + unexpectedNew),
    newRecall: ratio(correctNew, expectedNew),
    confusion,
    tags: Object.fromEntries(Object.entries(tags).sort(([a], [b]) => a.localeCompare(b))),
    failures,
  };
}

type Summary = EvaluationSummary<ReturnType<typeof summarize>>;

function printDetails(matcherId: string, summary: Summary) {
  console.log(`\n${matcherId}: ${summary.candidates} candidates in ${summary.batches} batches`);
  if (summary.otherAssetMatches > 0 || summary.nonexistentMatches > 0) {
    console.log(
      `  Contract violations: ${summary.otherAssetMatches} matches on another asset, ` +
        `${summary.nonexistentMatches} matches on nonexistent findings`,
    );
  }
  if (summary.failures.length > 0) {
    const shown = summary.failures.slice(0, 10).join(", ");
    const more = summary.failures.length > 10 ? ", ..." : "";
    console.log(`  Failures (${summary.failures.length}): ${shown}${more}`);
  }
}

export const findingMatching: MatcherKind<
  FindingBatchCase,
  FindingScenario,
  FindingFixture,
  FindingMatcher,
  FindingMatchResult[],
  BatchEvaluation,
  ReturnType<typeof summarize>
> = {
  name: "finding-matching",
  schemaVersion: 1,
  validateScenario,
  fixture: ({ assets, findings, observations }) => ({ assets, findings, observations }),
  describe: (scenario) => ({
    assetCount: scenario.assets.length,
    findingCount: scenario.findings.length,
    observationCount: scenario.observations.length,
  }),
  call: (matcher, batch, logger) =>
    matcher.match(
      batch.assetId,
      batch.candidates.map((entry) => entry.candidate),
      logger,
    ),
  parse,
  score,
  summarize,
  consoleColumns: (summary) => ({
    batches: summary.batches,
    candidates: summary.candidates,
    wrong: summary.wrongMatches,
    unexpectedNew: summary.unexpectedNew,
    regrouped: summary.wrongGroupings,
    errors: summary.errors + summary.setupFailures,
    notRun: summary.notRun,
    precision: percent(summary.matchPrecision),
    recall: percent(summary.matchRecall),
    newPrecision: percent(summary.newPrecision),
    newRecall: percent(summary.newRecall),
  }),
  printDetails,
};

export function evaluateFindingMatchers(
  dataset: FindingDataset,
  factories: FindingMatcherFactory[],
  options?: EvaluationOptions,
) {
  return evaluateMatchers(findingMatching, dataset, factories, options);
}
