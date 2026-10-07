import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, open, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";

import { defaultEvaluationSuites, evaluateAssetMatchers, evaluationSuites } from "./evaluate.js";

import type { EvaluationDataset, EvaluationSuite, MatcherFactory } from "./evaluate.js";
import type { ExecFileSyncOptionsWithStringEncoding } from "node:child_process";

function percent(value: number | null) {
  return value === null ? "N/A" : `${(100 * value).toFixed(1)}%`;
}

export async function runEvaluationCommand(
  args: string[],
  /** A dataset, or a loader for datasets that must be expanded before use. */
  datasetSource: EvaluationDataset | (() => Promise<EvaluationDataset>),
  factories: MatcherFactory[],
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
    console.log(`Usage: pnpm eval:asset-matching [options]
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
      `evaluation-results/asset-matching-${startedAt.replaceAll(":", "-")}-${randomUUID()}.json`,
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
    const evaluation = await evaluateAssetMatchers(dataset, factories, {
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
          cases: summary.cases,
          candidates: summary.weighted.candidates,
          wrong: summary.wrongAssignments,
          errors: summary.errors + summary.setupFailures,
          notRun: summary.notRun,
          precision: percent(summary.assignmentPrecision),
          recall: percent(summary.matchRecall),
          coverage: percent(summary.weighted.coverage),
          misattributed: percent(summary.weighted.misattributionRate),
          setupMs: summary.setupTiming.totalMs.toFixed(3),
          medianMs: summary.completedTiming.medianMs?.toFixed(3) ?? "N/A",
          p95Ms: summary.completedTiming.p95Ms?.toFixed(3) ?? "N/A",
        })),
      ),
    );
    for (const matcher of report.matchers) {
      printGapSummary(matcher.id, matcher.summary);
    }
    console.log(`Report: ${outputPath}`);
    return report.matchers.some(
      (matcher) => matcher.summary.errors > 0 || matcher.summary.setupFailures > 0,
    )
      ? 1
      : 0;
  } finally {
    await output.close();
    if (!written) await rm(outputPath, { force: true });
  }
}

type Summary = Awaited<ReturnType<typeof evaluateAssetMatchers>>["matchers"][number]["summary"];

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
