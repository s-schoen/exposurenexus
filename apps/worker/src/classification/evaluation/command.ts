import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, open, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";

import { defaultEvaluationSuites, evaluateMatchers, evaluationSuites } from "./harness.js";

import type {
  EvaluationDataset,
  EvaluationScenario,
  EvaluationSuite,
  MatcherFactory,
  MatcherKind,
} from "./harness.js";
import type { ExecFileSyncOptionsWithStringEncoding } from "node:child_process";

export function percent(value: number | null) {
  return value === null ? "N/A" : `${(100 * value).toFixed(1)}%`;
}

export async function runEvaluationCommand<
  Case extends { id: string },
  Scenario extends EvaluationScenario<Case>,
  Fixture,
  Matcher extends { match(...args: never[]): unknown },
  Result,
  Scored,
  Quality,
>(
  args: string[],
  kind: MatcherKind<Case, Scenario, Fixture, Matcher, Result, Scored, Quality>,
  /** A dataset, or a loader for datasets that must be expanded before use. */
  datasetSource: EvaluationDataset<Scenario> | (() => Promise<EvaluationDataset<Scenario>>),
  factories: MatcherFactory<Fixture, Matcher>[],
) {
  const { values } = parseArgs({
    args,
    allowPositionals: false,
    options: {
      matcher: { type: "string", multiple: true },
      scenario: { type: "string", multiple: true },
      suite: { type: "string", multiple: true },
      output: { type: "string" },
      "allow-network": { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });
  const suites = values.suite?.map((suite) => {
    if (!evaluationSuites.includes(suite as EvaluationSuite)) {
      throw new Error(`Unknown suite: ${JSON.stringify(suite)}.`);
    }
    return suite as EvaluationSuite;
  });
  const dataset = typeof datasetSource === "function" ? await datasetSource() : datasetSource;
  if (values.help) {
    console.log(`Usage: pnpm eval:${kind.name} [options]
  --matcher NAME    Select a matcher (repeatable; defaults to all offline matchers)
  --suite NAME      Select a suite: ${evaluationSuites.join(", ")} (repeatable;
                    defaults to ${defaultEvaluationSuites.join(", ")})
  --scenario NAME   Select a scenario (repeatable; searches all suites unless --suite is given)
  --allow-network   Permit explicitly selected network-backed matchers
  --output PATH     Write a new JSON report here (never overwrites an existing file)
  --help            Show this help

Matchers: ${factories.map((factory) => factory.id).join(", ") || "(none registered)"}
Scenarios: ${dataset.scenarios
      .map((scenario) => `${scenario.id} (${scenario.suite ?? "edge"})`)
      .join(", ")}`);
    return 0;
  }

  const startedAt = new Date().toISOString();
  const outputPath = resolve(
    values.output ??
      `evaluation-results/${kind.name}-${startedAt.replaceAll(":", "-")}-${randomUUID()}.json`,
  );
  const source: { revision: string | null; dirty: boolean | null } = {
    revision: null,
    dirty: null,
  };
  try {
    const gitOptions = {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 2000,
    } satisfies ExecFileSyncOptionsWithStringEncoding;
    source.revision = execFileSync("git", ["rev-parse", "HEAD"], gitOptions).trim();
    source.dirty = execFileSync("git", ["status", "--porcelain"], gitOptions).trim().length > 0;
  } catch {
    // Exported source trees need not have Git metadata available.
  }

  await mkdir(dirname(outputPath), { recursive: true });
  // Reserve the output before any paid work, and never overwrite a previous report.
  const output = await open(outputPath, "wx", 0o600);
  let written = false;
  try {
    const evaluation = await evaluateMatchers(kind, dataset, factories, {
      matcherIds: values.matcher,
      scenarioIds: values.scenario,
      suites,
      allowNetwork: values["allow-network"],
    });
    const report = {
      ...evaluation,
      run: {
        startedAt,
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        source,
      },
    };
    await output.writeFile(`${JSON.stringify(report, null, 2)}\n`, "utf8");
    written = true;

    console.table(
      report.matchers.flatMap((matcher) =>
        [
          ...matcher.scenarios.map((scenario) => ({
            label: scenario.id,
            summary: scenario.summary,
          })),
          { label: "(all)", summary: matcher.summary },
        ].map(({ label, summary }) => ({
          matcher: matcher.id,
          scenario: label,
          ...kind.consoleColumns(summary),
          setupMs: summary.setupTiming.totalMs.toFixed(3),
          medianMs: summary.completedTiming.medianMs?.toFixed(3) ?? "N/A",
          p95Ms: summary.completedTiming.p95Ms?.toFixed(3) ?? "N/A",
        })),
      ),
    );
    for (const matcher of report.matchers) {
      kind.printDetails?.(matcher.id, matcher.summary);
    }
    console.log(`Report: ${outputPath}`);
    return report.matchers.some(
      (matcher) => matcher.summary.failedTiming.count > 0 || matcher.summary.setupFailures > 0,
    )
      ? 1
      : 0;
  } finally {
    await output.close();
    if (!written) await rm(outputPath, { force: true });
  }
}
