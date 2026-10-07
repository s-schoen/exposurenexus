import { assetIdentifierSchema } from "@exposurenexus/backend/assets";
import { AffectedResourceType } from "@exposurenexus/contracts/model/affected-resource";
import { assetSchema } from "@exposurenexus/contracts/model/asset";
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

import type { AssetMatcher, AssetMatchResult } from "../../asset-matcher.js";
import type { ObservationCandidate } from "../../classifier.js";
import type {
  CallRun,
  EvaluationDataset as Dataset,
  EvaluationOptions,
  EvaluationScenario,
  EvaluationSummary,
  MatcherFactory as Factory,
  MatcherKind,
} from "../harness.js";
import type { Asset, AssetIdentifier } from "@exposurenexus/contracts/model/asset";

export type ExpectedAssetMatch =
  | { status: "matched"; assetId: string }
  | { status: "unresolved"; reason: Extract<AssetMatchResult, { status: "unresolved" }>["reason"] };

export type EvaluationCase = {
  id: string;
  candidate: ObservationCandidate;
  /** The correct decision given only the candidate's evidence and the inventory. */
  expected: ExpectedAssetMatch;
  /**
   * The asset the subject really is, which inventory drift can hide from any matcher;
   * null when the subject is absent from inventory. Defaults to an expected match's asset.
   */
  truthAssetId?: string | null;
  /** Other unresolved decisions the contract permits; they score as correct but uncovered. */
  acceptable?: ExpectedAssetMatch[];
  /** Breakdown labels such as `drift:stale-ip`; `source:` and `evidence:` tags are derived. */
  tags?: string[];
  /** Why current matchers are expected to fail this case. */
  knownGap?: string;
  /** How many source candidates this case stands for; defaults to 1. */
  weight?: number;
  /** Why the labels are what they are; for reviewers, never scored or reported. */
  note?: string;
};

export type InventoryScenario = EvaluationScenario<EvaluationCase> & { assets: Asset[] };
export type EvaluationDataset = Dataset<InventoryScenario>;
export type MatcherFactory = Factory<readonly Asset[], AssetMatcher>;

type CaseOutcome =
  | "correct_assignment"
  | "wrong_assignment"
  | "missed_match"
  | "correctly_unresolved"
  | "acceptable_alternative"
  | "incorrect_unresolved_reason"
  | "error"
  | "not_run";

type CaseEvaluation = {
  id: string;
  scenarioId: string;
  tags: string[];
  weight: number;
  truthAssetId?: string | null;
  knownGap: string | null;
  expected: ExpectedAssetMatch;
  actual: AssetMatchResult | null;
  outcome: CaseOutcome;
  durationMs: number | null;
  error: string | null;
};

const resultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("matched"), assetId: z.string(), explanation: z.string() }),
  z.object({
    status: z.literal("unresolved"),
    reason: z.enum(["insufficient_evidence", "no_match", "ambiguous", "conflicting_identifiers"]),
    explanation: z.string(),
  }),
]);

/** Which identity evidence a candidate offers, by field presence, independent of any matcher. */
export function evidenceTier(candidate: ObservationCandidate): "explicit" | "context" | "none" {
  if (candidate.assetIdentifierCandidates.length > 0) return "explicit";
  const resource = candidate.affectedResource;
  switch (resource.type) {
    case AffectedResourceType.WebEndpoint:
    case AffectedResourceType.NetworkService:
      return resource.host === undefined ? "none" : "context";
    case AffectedResourceType.SourceCode:
      return resource.repository === undefined ? "none" : "context";
    case AffectedResourceType.ContainerImage:
      return resource.registry === undefined && resource.repository === undefined
        ? "none"
        : "context";
    case AffectedResourceType.CloudResource:
      return resource.resourceId === undefined ? "none" : "context";
    case AffectedResourceType.Package:
    case AffectedResourceType.Unspecified:
      return "none";
  }
}

function identifierKeys(identifiers: AssetIdentifier[], context: string) {
  return identifiers.map((identifier) => {
    assertCanonical(
      assetIdentifierSchema,
      identifier,
      `Invalid or noncanonical identifier in ${context}.`,
    );
    return JSON.stringify([identifier.type, identifier.namespace, identifier.value]);
  });
}

function validateScenario(scenario: InventoryScenario) {
  const assets = uniqueIds(scenario.assets, "asset");
  const identifiers = new Set<string>();
  uniqueIds(
    scenario.assets.flatMap((asset) => asset.identifiers),
    "identifier record",
  );
  for (const asset of scenario.assets) {
    assertCanonical(assetSchema, asset, `Invalid asset in scenario ${scenario.id}.`);
    const keys = identifierKeys(
      asset.identifiers.map(({ type, namespace, value }) => ({ type, namespace, value })),
      `scenario ${scenario.id}`,
    );
    for (const key of keys) {
      if (identifiers.has(key))
        throw new Error(`Duplicate inventory identifier in ${scenario.id}.`);
      identifiers.add(key);
    }
  }
  for (const testCase of scenario.cases) {
    const context = `${scenario.id}/${testCase.id}`;
    const expected = resultSchema.safeParse({ ...testCase.expected, explanation: "" });
    if (!expected.success) throw new Error(`Invalid expected outcome in ${context}.`);
    if (expected.data.status === "matched" && !assets.has(expected.data.assetId)) {
      throw new Error(`Expected asset is not in the inventory for ${context}.`);
    }
    assertCanonical(
      candidateSchema,
      testCase.candidate,
      `Invalid or noncanonical observation candidate in ${context}.`,
    );
    const { truthAssetId, acceptable, tags, knownGap, weight, note } = testCase;
    if (truthAssetId !== undefined && truthAssetId !== null && !assets.has(truthAssetId)) {
      throw new Error(`Truth asset is not in the inventory for ${context}.`);
    }
    if (
      acceptable !== undefined &&
      (!Array.isArray(acceptable) ||
        acceptable.some(
          (entry) =>
            !resultSchema.safeParse({ ...entry, explanation: "" }).success ||
            entry.status !== "unresolved",
        ))
    ) {
      throw new Error(`Acceptable outcomes must be valid unresolved decisions in ${context}.`);
    }
    validateTags(tags, context);
    if (knownGap !== undefined && (typeof knownGap !== "string" || knownGap.trim().length === 0)) {
      throw new Error(`Known gaps need a description in ${context}.`);
    }
    if (weight !== undefined && (!Number.isSafeInteger(weight) || weight < 1)) {
      throw new Error(`Case weights must be positive integers in ${context}.`);
    }
    validateNote(note, context);
  }
}

const correctOutcomes = new Set<CaseOutcome>([
  "correct_assignment",
  "correctly_unresolved",
  "acceptable_alternative",
]);

function truthMatched(entry: CaseEvaluation) {
  return entry.actual?.status === "matched" && entry.actual.assetId === entry.truthAssetId;
}

function misattributed(entry: CaseEvaluation) {
  return (
    entry.actual?.status === "matched" &&
    entry.truthAssetId !== undefined &&
    entry.actual.assetId !== entry.truthAssetId
  );
}

function tally(cases: CaseEvaluation[], weightOf: (entry: CaseEvaluation) => number) {
  const total = (keep: (entry: CaseEvaluation) => boolean) =>
    cases.filter(keep).reduce((sum, entry) => sum + weightOf(entry), 0);
  const outcome = (value: CaseOutcome) => total((entry) => entry.outcome === value);
  const all = total(() => true);
  const correctAssignments = outcome("correct_assignment");
  const wrongAssignments = outcome("wrong_assignment");
  const expectedMatches = total((entry) => entry.expected.status === "matched");
  const withTruth = total((entry) => typeof entry.truthAssetId === "string");
  return {
    total: all,
    expectedMatches,
    correctAssignments,
    wrongAssignments,
    missedMatches: outcome("missed_match"),
    correctlyUnresolved: outcome("correctly_unresolved"),
    acceptableAlternatives: outcome("acceptable_alternative"),
    incorrectUnresolvedReasons: outcome("incorrect_unresolved_reason"),
    errors: outcome("error"),
    notRun: outcome("not_run"),
    assignmentPrecision: ratio(correctAssignments, correctAssignments + wrongAssignments),
    matchRecall: ratio(correctAssignments, expectedMatches),
    /** Share of subjects with a known inventory asset that were assigned to it. */
    coverage: ratio(total(truthMatched), withTruth),
    wrongAssignmentRate: ratio(wrongAssignments, all),
    /** Assignments to anything but the real subject, including inventory-induced ones. */
    misattributionRate: ratio(total(misattributed), all),
  };
}

function decisionLabel(entry: CaseEvaluation) {
  if (entry.actual === null) return entry.outcome;
  if (entry.actual.status === "unresolved") return entry.actual.reason;
  return entry.outcome === "correct_assignment" ? "matched" : "matched:other";
}

function summarize(cases: CaseEvaluation[]) {
  const { total: caseCount, ...unweighted } = tally(cases, () => 1);
  const { total: candidates, ...weighted } = tally(cases, (entry) => entry.weight);

  // Candidate-weighted: expected decision -> actual decision.
  const confusion: Record<string, Record<string, number>> = {};
  const tags: Record<
    string,
    {
      cases: number;
      candidates: number;
      correct: number;
      wrongAssignments: number;
      misattributed: number;
      uncovered: number;
    }
  > = {};
  const knownGaps: Record<string, { open: number; closed: number; candidates: number }> = {};
  const unexpectedFailures: string[] = [];
  for (const entry of cases) {
    const expected = entry.expected.status === "matched" ? "matched" : entry.expected.reason;
    confusion[expected] ??= {};
    const actual = decisionLabel(entry);
    confusion[expected][actual] = (confusion[expected][actual] ?? 0) + entry.weight;

    const correct = correctOutcomes.has(entry.outcome);
    for (const tag of entry.tags) {
      const stats = (tags[tag] ??= {
        cases: 0,
        candidates: 0,
        correct: 0,
        wrongAssignments: 0,
        misattributed: 0,
        uncovered: 0,
      });
      stats.cases += 1;
      stats.candidates += entry.weight;
      if (correct) stats.correct += entry.weight;
      if (entry.outcome === "wrong_assignment") stats.wrongAssignments += entry.weight;
      if (misattributed(entry)) stats.misattributed += entry.weight;
      if (typeof entry.truthAssetId === "string" && !truthMatched(entry)) {
        stats.uncovered += entry.weight;
      }
    }

    if (entry.outcome === "not_run") {
      continue;
    }
    if (entry.knownGap !== null) {
      const gap = (knownGaps[entry.knownGap] ??= { open: 0, closed: 0, candidates: 0 });
      gap[correct ? "closed" : "open"] += 1;
      gap.candidates += entry.weight;
    } else if (!correct) {
      unexpectedFailures.push(`${entry.scenarioId}/${entry.id}`);
    }
  }

  return {
    cases: caseCount,
    ...unweighted,
    weighted: { candidates, ...weighted },
    confusion,
    tags: Object.fromEntries(Object.entries(tags).sort(([a], [b]) => a.localeCompare(b))),
    knownGaps,
    unexpectedFailures,
  };
}

function score(
  scenario: InventoryScenario,
  testCase: EvaluationCase,
  run: CallRun<AssetMatchResult>,
): CaseEvaluation {
  const expected: ExpectedAssetMatch =
    testCase.expected.status === "matched"
      ? { status: "matched", assetId: testCase.expected.assetId }
      : { status: "unresolved", reason: testCase.expected.reason };
  const metadata = {
    id: testCase.id,
    scenarioId: scenario.id,
    tags: [
      ...new Set([
        `source:${testCase.candidate.source}`,
        `evidence:${evidenceTier(testCase.candidate)}`,
        ...(testCase.tags ?? []),
      ]),
    ],
    weight: testCase.weight ?? 1,
    truthAssetId:
      testCase.truthAssetId !== undefined
        ? testCase.truthAssetId
        : expected.status === "matched"
          ? expected.assetId
          : undefined,
    knownGap: testCase.knownGap ?? null,
    expected,
    actual: run.result,
    durationMs: run.durationMs,
    error: run.error,
  };
  const actual = run.result;
  if (run.status === "not_run") return { ...metadata, outcome: "not_run" };
  if (actual === null) return { ...metadata, outcome: "error" };
  let outcome: CaseOutcome;
  if (actual.status === "matched") {
    outcome =
      expected.status === "matched" && expected.assetId === actual.assetId
        ? "correct_assignment"
        : "wrong_assignment";
  } else if (expected.status === "matched") {
    outcome = "missed_match";
  } else {
    outcome =
      actual.reason === expected.reason ? "correctly_unresolved" : "incorrect_unresolved_reason";
  }
  if (
    actual.status === "unresolved" &&
    !correctOutcomes.has(outcome) &&
    testCase.acceptable?.some(
      (entry) => entry.status === "unresolved" && entry.reason === actual.reason,
    )
  ) {
    outcome = "acceptable_alternative";
  }
  return { ...metadata, outcome };
}

type Summary = EvaluationSummary<ReturnType<typeof summarize>>;

/** Candidate-weighted overview of where coverage is lost; the JSON report has the detail. */
function printGapSummary(matcherId: string, summary: Summary) {
  const candidates = summary.weighted.candidates;
  const evidence = ["explicit", "context", "none"]
    .map(
      (tier) =>
        `${tier} ${percent((summary.tags[`evidence:${tier}`]?.candidates ?? 0) / candidates)}`,
    )
    .join(" · ");
  console.log(`\n${matcherId}: ${candidates} candidates; identity evidence ${evidence}`);

  const uncovered = Object.entries(summary.tags)
    .filter(
      ([tag, stats]) =>
        !["evidence:", "source:", "recipe:"].some((prefix) => tag.startsWith(prefix)) &&
        stats.uncovered > 0,
    )
    .sort(([, a], [, b]) => b.uncovered - a.uncovered)
    .slice(0, 8);
  if (uncovered.length > 0) {
    console.log("  Largest coverage losses (candidates whose real asset was not assigned):");
    for (const [tag, stats] of uncovered) {
      const misattributed = stats.misattributed > 0 ? `, ${stats.misattributed} misattributed` : "";
      console.log(`    ${tag}: ${stats.uncovered} of ${stats.candidates}${misattributed}`);
    }
  }

  const sources = Object.entries(summary.tags)
    .filter(([tag]) => tag.startsWith("source:"))
    .map(
      ([tag, stats]) =>
        `${tag.slice("source:".length)} ${stats.candidates - stats.uncovered}/${stats.candidates}`,
    );
  if (sources.length > 0) {
    console.log(`  Covered by source: ${sources.join(", ")}`);
  }

  const gaps = Object.entries(summary.knownGaps);
  if (gaps.length > 0) {
    console.log("  Known gaps (open/closed cases):");
    for (const [gap, stats] of gaps) {
      console.log(`    ${stats.open}/${stats.closed} ${gap}`);
    }
  }
  if (summary.unexpectedFailures.length > 0) {
    const shown = summary.unexpectedFailures.slice(0, 10).join(", ");
    const more = summary.unexpectedFailures.length > 10 ? ", ..." : "";
    console.log(`  Unexpected failures (${summary.unexpectedFailures.length}): ${shown}${more}`);
  }
}

export const assetMatching: MatcherKind<
  EvaluationCase,
  InventoryScenario,
  readonly Asset[],
  AssetMatcher,
  AssetMatchResult,
  CaseEvaluation,
  ReturnType<typeof summarize>
> = {
  name: "asset-matching",
  schemaVersion: 2,
  validateScenario,
  fixture: (scenario) => scenario.assets,
  describe: (scenario) => ({ assetCount: scenario.assets.length }),
  call: (matcher, testCase, logger) => matcher.match(testCase.candidate, logger),
  parse: (result) => {
    const parsed = resultSchema.safeParse(result);
    return parsed.success ? parsed.data : undefined;
  },
  score,
  summarize,
  consoleColumns: (summary) => ({
    cases: summary.cases,
    candidates: summary.weighted.candidates,
    wrong: summary.wrongAssignments,
    errors: summary.errors + summary.setupFailures,
    notRun: summary.notRun,
    precision: percent(summary.assignmentPrecision),
    recall: percent(summary.matchRecall),
    coverage: percent(summary.weighted.coverage),
    misattributed: percent(summary.weighted.misattributionRate),
  }),
  printDetails: printGapSummary,
};

export function evaluateAssetMatchers(
  dataset: EvaluationDataset,
  factories: MatcherFactory[],
  options?: EvaluationOptions,
) {
  return evaluateMatchers(assetMatching, dataset, factories, options);
}
