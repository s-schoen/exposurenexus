import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { isDeepStrictEqual } from "node:util";

import { assetIdentifierSchema } from "@exposurenexus/backend/assets";
import { weaknessSchema } from "@exposurenexus/backend/findings";
import {
  AffectedResourceType,
  observationAffectedResourceSchema,
} from "@exposurenexus/contracts/model/affected-resource";
import { assetSchema } from "@exposurenexus/contracts/model/asset";
import { VulnerabilitySeverity } from "@exposurenexus/contracts/model/vulnerability";
import pino from "pino";
import { z } from "zod/v4";

import type { AssetMatcher, AssetMatchResult } from "../asset-matcher.js";
import type { ObservationCandidate } from "../classifier.js";
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

export const evaluationSuites = ["edge", "replay", "generated", "heldout"] as const;
export type EvaluationSuite = (typeof evaluationSuites)[number];
/** Held-out cases run only when explicitly selected, so tuning cannot overfit them. */
export const defaultEvaluationSuites: readonly EvaluationSuite[] = ["edge", "replay", "generated"];

export type InventoryScenario = {
  id: string;
  /** Defaults to `edge`. */
  suite?: EvaluationSuite;
  assets: Asset[];
  cases: EvaluationCase[];
};
export type EvaluationDataset = { id: string; scenarios: InventoryScenario[] };

export type MatcherFactory = {
  id: string;
  requiresNetwork: boolean;
  /** Explicitly approved, non-secret identifiers such as model/version. */
  metadata?: Record<string, string>;
  create(assets: readonly Asset[]): AssetMatcher | Promise<AssetMatcher>;
};

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

type SetupEvaluation = { durationMs: number; error: string | null };
type ScenarioEvaluation = {
  id: string;
  suite: EvaluationSuite;
  assetCount: number;
  setup: SetupEvaluation;
  cases: CaseEvaluation[];
  summary: ReturnType<typeof summarize>;
};

const resultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("matched"), assetId: z.string(), explanation: z.string() }),
  z.object({
    status: z.literal("unresolved"),
    reason: z.enum(["insufficient_evidence", "no_match", "ambiguous", "conflicting_identifiers"]),
    explanation: z.string(),
  }),
]);

// Hand-authored evaluation fixtures, unlike classifier output, need full preflight validation.
const candidateSchema = z.strictObject({
  source: z.string(),
  sourceRecord: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  remediation: z.string().nullable(),
  evidence: z.string().nullable(),
  severity: z.enum(VulnerabilitySeverity),
  weakness: weaknessSchema,
  affectedResource: observationAffectedResourceSchema,
  observedAt: z.date().nullable(),
  assetIdentifierCandidates: z.array(assetIdentifierSchema),
  sourceMetadata: z.record(z.string(), z.unknown()),
}) satisfies z.ZodType<ObservationCandidate>;

const tagPattern = /^[a-z0-9][a-z0-9._:/-]*$/i;

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

function uniqueIds(entries: { id: string }[], kind: string) {
  if (
    entries.some(
      (entry) => typeof entry.id !== "string" || !/^[a-z0-9][a-z0-9._-]*$/i.test(entry.id),
    )
  ) {
    throw new Error(`Invalid ${kind} ID; use letters, digits, dots, underscores, and hyphens.`);
  }
  const ids = new Set(entries.map((entry) => entry.id));
  if (ids.size !== entries.length) throw new Error(`Duplicate ${kind} IDs.`);
  return ids;
}

function identifierKeys(identifiers: AssetIdentifier[], context: string) {
  return identifiers.map((identifier) => {
    const parsed = assetIdentifierSchema.safeParse(identifier);
    if (!parsed.success || !isDeepStrictEqual(parsed.data, identifier)) {
      throw new Error(`Invalid or noncanonical identifier in ${context}.`);
    }
    return JSON.stringify([identifier.type, identifier.namespace, identifier.value]);
  });
}

function validateDataset(dataset: EvaluationDataset) {
  uniqueIds([dataset], "dataset");
  uniqueIds(dataset.scenarios, "scenario");
  if (dataset.scenarios.length === 0) throw new Error("The dataset has no inventory scenarios.");
  for (const scenario of dataset.scenarios) {
    if (scenario.suite !== undefined && !evaluationSuites.includes(scenario.suite)) {
      throw new Error(`Unknown suite for scenario ${scenario.id}.`);
    }
    const assets = uniqueIds(scenario.assets, "asset");
    uniqueIds(scenario.cases, "case");
    if (scenario.cases.length === 0) throw new Error(`Scenario ${scenario.id} has no cases.`);
    const identifiers = new Set<string>();
    uniqueIds(
      scenario.assets.flatMap((asset) => asset.identifiers),
      "identifier record",
    );
    for (const asset of scenario.assets) {
      const parsed = assetSchema.safeParse(asset);
      if (!parsed.success || !isDeepStrictEqual(parsed.data, asset)) {
        throw new Error(`Invalid asset in scenario ${scenario.id}.`);
      }
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
      const candidate = candidateSchema.safeParse(testCase.candidate);
      if (!candidate.success || !isDeepStrictEqual(candidate.data, testCase.candidate)) {
        throw new Error(`Invalid or noncanonical observation candidate in ${context}.`);
      }
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
      if (
        tags !== undefined &&
        (!Array.isArray(tags) ||
          tags.some((tag) => typeof tag !== "string" || !tagPattern.test(tag)))
      ) {
        throw new Error(`Invalid tag in ${context}.`);
      }
      if (
        knownGap !== undefined &&
        (typeof knownGap !== "string" || knownGap.trim().length === 0)
      ) {
        throw new Error(`Known gaps need a description in ${context}.`);
      }
      if (weight !== undefined && (!Number.isSafeInteger(weight) || weight < 1)) {
        throw new Error(`Case weights must be positive integers in ${context}.`);
      }
      if (note !== undefined && (typeof note !== "string" || note.trim().length === 0)) {
        throw new Error(`Notes must not be empty in ${context}.`);
      }
    }
  }
}

function timingSummary(durations: number[]) {
  const sorted = durations.toSorted((a, b) => a - b);
  const count = sorted.length;
  return {
    count,
    totalMs: sorted.reduce((total, duration) => total + duration, 0),
    medianMs:
      count === 0
        ? null
        : (sorted[Math.floor((count - 1) / 2)] + sorted[Math.floor(count / 2)]) / 2,
    p95Ms: count === 0 ? null : sorted[Math.ceil(count * 0.95) - 1],
  };
}

const correctOutcomes = new Set<CaseOutcome>([
  "correct_assignment",
  "correctly_unresolved",
  "acceptable_alternative",
]);

function ratio(numerator: number, denominator: number) {
  return denominator === 0 ? null : numerator / denominator;
}

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

function summarize(cases: CaseEvaluation[], setups: SetupEvaluation[]) {
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

  const notRun = unweighted.notRun;
  return {
    cases: caseCount,
    ...unweighted,
    weighted: { candidates, ...weighted },
    confusion,
    tags: Object.fromEntries(Object.entries(tags).sort(([a], [b]) => a.localeCompare(b))),
    knownGaps,
    unexpectedFailures,
    incomplete: notRun > 0,
    setupFailures: setups.filter((setup) => setup.error !== null).length,
    setupTiming: timingSummary(setups.map((setup) => setup.durationMs)),
    completedTiming: timingSummary(
      cases.filter((entry) => entry.actual !== null).map((entry) => entry.durationMs!),
    ),
    failedTiming: timingSummary(
      cases.filter((entry) => entry.outcome === "error").map((entry) => entry.durationMs!),
    ),
  };
}

function selectEntries<T extends { id: string }>(
  entries: T[],
  ids: string[] | undefined,
  kind: string,
) {
  uniqueIds(entries, kind);
  if (ids === undefined) return entries;
  return [...new Set(ids)].map((id) => {
    const entry = entries.find((item) => item.id === id);
    if (!entry) throw new Error(`Unknown ${kind}: ${JSON.stringify(id)}.`);
    return entry;
  });
}

/** One sequential pass; factories see only inventory, matchers only cloned candidates. */
export async function evaluateAssetMatchers(
  dataset: EvaluationDataset,
  factories: MatcherFactory[],
  options: {
    matcherIds?: string[];
    scenarioIds?: string[];
    /** Defaults to every suite when scenarios are named, otherwise to the default suites. */
    suites?: EvaluationSuite[];
    allowNetwork?: boolean;
  } = {},
) {
  let input: EvaluationDataset;
  let serialized: string;
  try {
    input = structuredClone(dataset);
    serialized = JSON.stringify(input);
  } catch {
    throw new Error("Evaluation fixtures must be cloneable and JSON-serializable.");
  }
  validateDataset(input);
  const fingerprint = createHash("sha256").update(serialized).digest("hex");
  if (
    factories.some(
      (factory) =>
        typeof factory.requiresNetwork !== "boolean" || typeof factory.create !== "function",
    )
  ) {
    throw new Error("Each matcher factory must declare requiresNetwork and provide create().");
  }
  const suites: readonly EvaluationSuite[] =
    options.suites ??
    (options.scenarioIds === undefined ? defaultEvaluationSuites : evaluationSuites);
  const unknownSuite = suites.find((suite) => !evaluationSuites.includes(suite));
  if (unknownSuite !== undefined)
    throw new Error(`Unknown suite: ${JSON.stringify(unknownSuite)}.`);
  const selectedScenarios = selectEntries(
    input.scenarios.filter((scenario) => suites.includes(scenario.suite ?? "edge")),
    options.scenarioIds,
    "scenario",
  );
  let selectedFactories = selectEntries(factories, options.matcherIds, "matcher");
  if (options.matcherIds === undefined) {
    selectedFactories = selectedFactories.filter((factory) => factory.requiresNetwork === false);
    if (selectedFactories.length === 0) {
      throw new Error("No offline matchers are registered. Add an evaluation factory first.");
    }
  }
  if (selectedFactories.length === 0 || selectedScenarios.length === 0) {
    throw new Error("Select at least one matcher and inventory scenario.");
  }
  if (!options.allowNetwork && selectedFactories.some((factory) => factory.requiresNetwork)) {
    throw new Error("Network-backed matchers require explicit selection and --allow-network.");
  }
  const logger = pino({ enabled: false });
  const matchers: Array<{
    id: string;
    requiresNetwork: boolean;
    metadata: Record<string, string>;
    scenarios: ScenarioEvaluation[];
    summary: ReturnType<typeof summarize>;
  }> = [];

  for (const factory of selectedFactories) {
    const scenarios: ScenarioEvaluation[] = [];
    for (const scenario of selectedScenarios) {
      const assets = structuredClone(scenario.assets);
      const setupStart = performance.now();
      let matcher: AssetMatcher | undefined;
      let setupError: string | null = null;
      try {
        matcher = await factory.create(assets);
        if (!matcher || typeof matcher.match !== "function") throw new Error("Invalid matcher.");
      } catch {
        matcher = undefined;
        setupError = "Matcher setup failed.";
      }
      const setup: SetupEvaluation = {
        durationMs: performance.now() - setupStart,
        error: setupError,
      };
      const cases: CaseEvaluation[] = [];
      for (const testCase of scenario.cases) {
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
        };
        if (matcher === undefined) {
          cases.push({
            ...metadata,
            expected,
            actual: null,
            outcome: "not_run",
            durationMs: null,
            error: null,
          });
          continue;
        }
        const candidate = structuredClone(testCase.candidate);
        const start = performance.now();
        let result: unknown;
        let callError: string | null = null;
        try {
          result = await matcher.match(candidate, logger);
        } catch {
          // Provider errors may contain prompts, credentials, or response bodies.
          callError = "Matcher call failed.";
        }
        const durationMs = performance.now() - start;
        const parsed = callError === null ? resultSchema.safeParse(result) : null;
        if (!parsed?.success) {
          cases.push({
            ...metadata,
            expected,
            actual: null,
            outcome: "error",
            durationMs,
            error: callError ?? "Matcher returned an invalid result.",
          });
          continue;
        }
        const actual: AssetMatchResult = parsed.data;
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
            actual.reason === expected.reason
              ? "correctly_unresolved"
              : "incorrect_unresolved_reason";
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
        cases.push({ ...metadata, expected, actual, outcome, durationMs, error: null });
      }
      scenarios.push({
        id: scenario.id,
        suite: scenario.suite ?? "edge",
        assetCount: scenario.assets.length,
        setup,
        cases,
        summary: summarize(cases, [setup]),
      });
    }
    matchers.push({
      id: factory.id,
      requiresNetwork: factory.requiresNetwork,
      metadata: { ...factory.metadata },
      scenarios,
      summary: summarize(
        scenarios.flatMap((scenario) => scenario.cases),
        scenarios.map((scenario) => scenario.setup),
      ),
    });
  }
  return {
    schemaVersion: 2 as const,
    dataset: {
      id: input.id,
      sha256: fingerprint,
    },
    matchers,
  };
}
