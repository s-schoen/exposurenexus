import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { isDeepStrictEqual } from "node:util";

import { assetIdentifierSchema } from "@exposurenexus/backend/assets";
import { weaknessSchema } from "@exposurenexus/backend/findings";
import { observationAffectedResourceSchema } from "@exposurenexus/contracts/model/affected-resource";
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
  expected: ExpectedAssetMatch;
};

export type InventoryScenario = { id: string; assets: Asset[]; cases: EvaluationCase[] };
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
  | "incorrect_unresolved_reason"
  | "error"
  | "not_run";

type CaseEvaluation = {
  id: string;
  expected: ExpectedAssetMatch;
  actual: AssetMatchResult | null;
  outcome: CaseOutcome;
  durationMs: number | null;
  error: string | null;
};

type SetupEvaluation = { durationMs: number; error: string | null };
type ScenarioEvaluation = {
  id: string;
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

function summarize(cases: CaseEvaluation[], setups: SetupEvaluation[]) {
  const count = (outcome: CaseOutcome) => cases.filter((entry) => entry.outcome === outcome).length;
  const correctAssignments = count("correct_assignment");
  const wrongAssignments = count("wrong_assignment");
  const assignments = correctAssignments + wrongAssignments;
  const expectedMatches = cases.filter((entry) => entry.expected.status === "matched").length;
  const notRun = count("not_run");
  return {
    cases: cases.length,
    expectedMatches,
    correctAssignments,
    wrongAssignments,
    missedMatches: count("missed_match"),
    correctlyUnresolved: count("correctly_unresolved"),
    incorrectUnresolvedReasons: count("incorrect_unresolved_reason"),
    errors: count("error"),
    notRun,
    assignmentPrecision: assignments === 0 ? null : correctAssignments / assignments,
    matchRecall: expectedMatches === 0 ? null : correctAssignments / expectedMatches,
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
  options: { matcherIds?: string[]; scenarioIds?: string[]; allowNetwork?: boolean } = {},
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
  const selectedScenarios = selectEntries(input.scenarios, options.scenarioIds, "scenario");
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
        if (matcher === undefined) {
          cases.push({
            id: testCase.id,
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
            id: testCase.id,
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
        cases.push({ id: testCase.id, expected, actual, outcome, durationMs, error: null });
      }
      scenarios.push({
        id: scenario.id,
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
    schemaVersion: 1 as const,
    dataset: {
      id: input.id,
      sha256: fingerprint,
    },
    matchers,
  };
}
