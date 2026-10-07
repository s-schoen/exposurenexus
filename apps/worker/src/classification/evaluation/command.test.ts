import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { AffectedResourceType } from "@exposurenexus/contracts/model/affected-resource";
import { AssetIdentifierType } from "@exposurenexus/contracts/model/asset-identifier";
import { VulnerabilitySeverity } from "@exposurenexus/contracts/model/vulnerability";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runEvaluationCommand } from "./command.js";

import type { EvaluationDataset, MatcherFactory } from "./evaluate.js";

const dataset: EvaluationDataset = {
  id: "command-test",
  scenarios: [
    {
      id: "network",
      assets: [],
      cases: [
        {
          id: "absent-host",
          expected: { status: "unresolved", reason: "no_match" },
          candidate: {
            source: "nuclei",
            sourceRecord: "line:1",
            title: "Security header",
            description: null,
            remediation: null,
            evidence: "private-evidence",
            severity: VulnerabilitySeverity.Low,
            weakness: { identifiers: {} },
            affectedResource: { type: AffectedResourceType.Unspecified },
            observedAt: null,
            assetIdentifierCandidates: [
              { type: AssetIdentifierType.DnsName, namespace: null, value: "absent.example.test" },
            ],
            sourceMetadata: { private: "private-metadata" },
          },
        },
      ],
    },
  ],
};

describe("runEvaluationCommand", () => {
  let directory: string;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "asset-matching-evaluation-"));
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "table").mockImplementation(() => {});
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(directory, { recursive: true, force: true });
  });

  it.each([false, true])(
    "writes the report before returning an exit code (execution failure: %s)",
    async (fails) => {
      const output = join(directory, "report.json");
      const factories: MatcherFactory[] = [
        {
          id: "example",
          requiresNetwork: false,
          metadata: { version: "test" },
          create: () => ({
            match: async () => {
              if (fails) throw new Error("private-provider-error");
              return {
                status: "matched",
                assetId: "nonexistent",
                explanation: "Wrong assignment.",
              };
            },
          }),
        },
      ];
      const exitCode = await runEvaluationCommand(["--output", output], dataset, factories);
      expect(exitCode).toBe(fails ? 1 : 0);
      const text = await readFile(output, "utf8");
      const report = JSON.parse(text);
      expect(report.schemaVersion).toBe(2);
      expect(report.dataset).toMatchObject({
        id: "command-test",
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      });
      expect(report.run).toMatchObject({
        startedAt: expect.any(String),
        nodeVersion: process.version,
      });
      expect(report.matchers[0].summary).toMatchObject({
        errors: fails ? 1 : 0,
        wrongAssignments: fails ? 0 : 1,
      });
      expect(text).not.toContain("private-");
      expect(console.table).toHaveBeenCalledOnce();
      expect(console.log).toHaveBeenCalledWith(`Report: ${output}`);
    },
  );

  it("requires explicit network opt-in and forwards named selections", async () => {
    const output = join(directory, "report.json");
    const create = vi.fn(() => ({
      match: async () => ({
        status: "unresolved" as const,
        reason: "no_match" as const,
        explanation: "No target.",
      }),
    }));
    const factories: MatcherFactory[] = [{ id: "live", requiresNetwork: true, create }];
    await expect(
      runEvaluationCommand(["--matcher", "live", "--output", output], dataset, factories),
    ).rejects.toThrow(/network/i);
    expect(create).not.toHaveBeenCalled();
    await expect(readFile(output)).rejects.toMatchObject({ code: "ENOENT" });
    expect(
      await runEvaluationCommand(
        [
          "--matcher",
          "live",
          "--matcher",
          "live",
          "--scenario",
          "network",
          "--allow-network",
          "--output",
          output,
        ],
        dataset,
        factories,
      ),
    ).toBe(0);
    expect(create).toHaveBeenCalledOnce();
  });

  it("rejects invalid runs and never overwrites an existing report", async () => {
    const output = join(directory, "report.json");
    const create = vi.fn(() => ({
      match: async () => ({
        status: "unresolved" as const,
        reason: "no_match" as const,
        explanation: "No target.",
      }),
    }));
    const factories: MatcherFactory[] = [{ id: "example", requiresNetwork: false, create }];
    await expect(
      runEvaluationCommand(["--repetitions", "2", "--output", output], dataset, factories),
    ).rejects.toThrow(/repetitions/);
    await expect(
      runEvaluationCommand(["--scenario", "unknown", "--output", output], dataset, factories),
    ).rejects.toThrow(/unknown scenario/i);
    await expect(runEvaluationCommand(["--output", output], dataset, [])).rejects.toThrow(
      /no offline matchers/i,
    );
    await expect(readFile(output)).rejects.toMatchObject({ code: "ENOENT" });
    await writeFile(output, "previous-report");
    await expect(
      runEvaluationCommand(["--output", output], dataset, factories),
    ).rejects.toMatchObject({ code: "EEXIST" });
    expect(await readFile(output, "utf8")).toBe("previous-report");
    expect(create).not.toHaveBeenCalled();
  });

  it("shows available scenarios without running a matcher", async () => {
    expect(await runEvaluationCommand(["--help"], dataset, [])).toBe(0);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("Scenarios: network"));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("(none registered)"));
  });
});
