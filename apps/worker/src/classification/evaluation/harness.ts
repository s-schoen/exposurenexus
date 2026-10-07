import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";

import pino from "pino";

import { uniqueIds } from "./fixtures.js";

import type { Logger } from "pino";

export const evaluationSuites = ["edge", "replay", "generated", "heldout"] as const;
export type EvaluationSuite = (typeof evaluationSuites)[number];
/** Held-out cases run only when explicitly selected, so tuning cannot overfit them. */
export const defaultEvaluationSuites: readonly EvaluationSuite[] = ["edge", "replay", "generated"];

export type EvaluationScenario<Case extends { id: string }> = {
  id: string;
  /** Defaults to `edge`. */
  suite?: EvaluationSuite;
  cases: Case[];
};
export type EvaluationDataset<Scenario> = { id: string; scenarios: Scenario[] };

export type MatcherFactory<Fixture, Matcher> = {
  id: string;
  requiresNetwork: boolean;
  /** Explicitly approved, non-secret identifiers such as model/version. */
  metadata?: Record<string, string>;
  create(fixture: Fixture): Matcher | Promise<Matcher>;
};

/** How one awaited matcher call ended; failures never retain provider messages. */
export type CallRun<Result> =
  | { status: "completed"; result: Result; durationMs: number; error: null }
  | { status: "failed"; result: null; durationMs: number; error: string }
  | { status: "not_run"; result: null; durationMs: null; error: null };

/** What one matcher contract contributes to the shared runner and command. */
export type MatcherKind<
  Case extends { id: string },
  Scenario extends EvaluationScenario<Case>,
  Fixture,
  Matcher extends { match(...args: never[]): unknown },
  Result,
  Scored,
  Quality,
> = {
  /** CLI and report name, such as `asset-matching`. */
  name: string;
  schemaVersion: number;
  /** Checks kind-specific contents; the runner already checked IDs, suites, and emptiness. */
  validateScenario(scenario: Scenario): void;
  /** What factories receive; the runner clones it for every setup. */
  fixture(scenario: Scenario): Fixture;
  /** Fixture sizes for the report. */
  describe(scenario: Scenario): Record<string, number>;
  /** Calls the matcher with a cloned case, passing only matcher inputs. */
  call(matcher: Matcher, testCase: Case, logger: Logger): Promise<unknown>;
  /** Returns the declared result fields, or undefined for an invalid result. */
  parse(result: unknown, testCase: Case): Result | undefined;
  score(scenario: Scenario, testCase: Case, run: CallRun<Result>): Scored;
  summarize(scored: Scored[]): Quality;
  /** Kind-specific console columns, shown between the scenario and timing columns. */
  consoleColumns(summary: EvaluationSummary<Quality>): Record<string, string | number>;
  /** Optional console detail printed after the table for each matcher. */
  printDetails?(matcherId: string, summary: EvaluationSummary<Quality>): void;
};

type TimingSummary = ReturnType<typeof timingSummary>;
export type EvaluationSummary<Quality> = Quality & {
  incomplete: boolean;
  setupFailures: number;
  setupTiming: TimingSummary;
  completedTiming: TimingSummary;
  failedTiming: TimingSummary;
};

type SetupEvaluation = { durationMs: number; error: string | null };

export function ratio(numerator: number, denominator: number) {
  return denominator === 0 ? null : numerator / denominator;
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

function summarize<Quality>(
  quality: Quality,
  runs: CallRun<unknown>[],
  setups: SetupEvaluation[],
): EvaluationSummary<Quality> {
  return {
    ...quality,
    incomplete: runs.some((run) => run.status === "not_run"),
    setupFailures: setups.filter((setup) => setup.error !== null).length,
    setupTiming: timingSummary(setups.map((setup) => setup.durationMs)),
    completedTiming: timingSummary(
      runs.filter((run) => run.status === "completed").map((run) => run.durationMs),
    ),
    failedTiming: timingSummary(
      runs.filter((run) => run.status === "failed").map((run) => run.durationMs),
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

export type EvaluationOptions = {
  matcherIds?: string[];
  scenarioIds?: string[];
  /** Defaults to every suite when scenarios are named, otherwise to the default suites. */
  suites?: EvaluationSuite[];
  allowNetwork?: boolean;
};

/** One sequential pass; factories see only fixtures, matchers only cloned matcher inputs. */
export async function evaluateMatchers<
  Case extends { id: string },
  Scenario extends EvaluationScenario<Case>,
  Fixture,
  Matcher extends { match(...args: never[]): unknown },
  Result,
  Scored,
  Quality,
>(
  kind: MatcherKind<Case, Scenario, Fixture, Matcher, Result, Scored, Quality>,
  dataset: EvaluationDataset<Scenario>,
  factories: MatcherFactory<Fixture, Matcher>[],
  options: EvaluationOptions = {},
) {
  let input: EvaluationDataset<Scenario>;
  let serialized: string;
  try {
    input = structuredClone(dataset);
    serialized = JSON.stringify(input);
  } catch {
    throw new Error("Evaluation fixtures must be cloneable and JSON-serializable.");
  }
  uniqueIds([input], "dataset");
  uniqueIds(input.scenarios, "scenario");
  if (input.scenarios.length === 0) throw new Error("The dataset has no scenarios.");
  for (const scenario of input.scenarios) {
    if (scenario.suite !== undefined && !evaluationSuites.includes(scenario.suite)) {
      throw new Error(`Unknown suite for scenario ${scenario.id}.`);
    }
    uniqueIds(scenario.cases, "case");
    if (scenario.cases.length === 0) throw new Error(`Scenario ${scenario.id} has no cases.`);
    kind.validateScenario(scenario);
  }
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
    throw new Error("Select at least one matcher and scenario.");
  }
  if (!options.allowNetwork && selectedFactories.some((factory) => factory.requiresNetwork)) {
    throw new Error("Network-backed matchers require explicit selection and --allow-network.");
  }
  const logger = pino({ enabled: false });
  const matchers = [];

  for (const factory of selectedFactories) {
    const scenarios = [];
    const matcherRuns: CallRun<Result>[] = [];
    const matcherScored: Scored[] = [];
    const setups: SetupEvaluation[] = [];
    for (const scenario of selectedScenarios) {
      const fixture = structuredClone(kind.fixture(scenario));
      const setupStart = performance.now();
      let matcher: Matcher | undefined;
      let setupError: string | null = null;
      try {
        matcher = await factory.create(fixture);
        if (!matcher || typeof matcher.match !== "function") throw new Error("Invalid matcher.");
      } catch {
        matcher = undefined;
        setupError = "Matcher setup failed.";
      }
      const setup: SetupEvaluation = {
        durationMs: performance.now() - setupStart,
        error: setupError,
      };
      const runs: CallRun<Result>[] = [];
      const cases: Scored[] = [];
      for (const testCase of scenario.cases) {
        let run: CallRun<Result>;
        if (matcher === undefined) {
          run = { status: "not_run", result: null, durationMs: null, error: null };
        } else {
          const cloned = structuredClone(testCase);
          const start = performance.now();
          let result: unknown;
          let callError: string | null = null;
          try {
            result = await kind.call(matcher, cloned, logger);
          } catch {
            // Provider errors may contain prompts, credentials, or response bodies.
            callError = "Matcher call failed.";
          }
          const durationMs = performance.now() - start;
          const parsed = callError === null ? kind.parse(result, testCase) : undefined;
          run =
            parsed === undefined
              ? {
                  status: "failed",
                  result: null,
                  durationMs,
                  error: callError ?? "Matcher returned an invalid result.",
                }
              : { status: "completed", result: parsed, durationMs, error: null };
        }
        runs.push(run);
        cases.push(kind.score(scenario, testCase, run));
      }
      setups.push(setup);
      matcherRuns.push(...runs);
      matcherScored.push(...cases);
      scenarios.push({
        id: scenario.id,
        suite: scenario.suite ?? "edge",
        ...kind.describe(scenario),
        setup,
        cases,
        summary: summarize(kind.summarize(cases), runs, [setup]),
      });
    }
    matchers.push({
      id: factory.id,
      requiresNetwork: factory.requiresNetwork,
      metadata: { ...factory.metadata },
      scenarios,
      summary: summarize(kind.summarize(matcherScored), matcherRuns, setups),
    });
  }
  return {
    schemaVersion: kind.schemaVersion,
    dataset: {
      id: input.id,
      sha256: fingerprint,
    },
    matchers,
  };
}
