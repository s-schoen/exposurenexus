import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, open, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";

import { evaluateAssetMatchers } from "./evaluate.js";

import type { EvaluationDataset, MatcherFactory } from "./evaluate.js";
import type { ExecFileSyncOptionsWithStringEncoding } from "node:child_process";

export async function runEvaluationCommand(
  args: string[],
  dataset: EvaluationDataset,
  factories: MatcherFactory[],
) {
  const { values } = parseArgs({
    args,
    allowPositionals: false,
    options: {
      matcher: { type: "string", multiple: true },
      scenario: { type: "string", multiple: true },
      output: { type: "string" },
      "allow-network": { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) {
    console.log(`Usage: pnpm eval:asset-matching [options]
  --matcher NAME    Select a matcher (repeatable; defaults to all offline matchers)
  --scenario NAME   Select an inventory scenario (repeatable; defaults to all)
  --allow-network   Permit explicitly selected network-backed matchers
  --output PATH     Write a new JSON report here (never overwrites an existing file)
  --help            Show this help

Matchers: ${factories.map((factory) => factory.id).join(", ") || "(none registered)"}
Scenarios: ${dataset.scenarios.map((scenario) => scenario.id).join(", ")}`);
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
          wrong: summary.wrongAssignments,
          errors: summary.errors + summary.setupFailures,
          notRun: summary.notRun,
          precision:
            summary.assignmentPrecision === null
              ? "N/A"
              : `${(100 * summary.assignmentPrecision).toFixed(1)}%`,
          recall:
            summary.matchRecall === null ? "N/A" : `${(100 * summary.matchRecall).toFixed(1)}%`,
          setupMs: summary.setupTiming.totalMs.toFixed(3),
          medianMs: summary.completedTiming.medianMs?.toFixed(3) ?? "N/A",
          p95Ms: summary.completedTiming.p95Ms?.toFixed(3) ?? "N/A",
        })),
      ),
    );
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
