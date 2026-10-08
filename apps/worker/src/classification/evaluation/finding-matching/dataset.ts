import { readdir, readFile } from "node:fs/promises";

import { dataset as edgeDataset } from "./scenarios.js";

import type { ExpectedFindingMatch, FindingDataset, FindingScenario } from "./evaluate.js";

const dataDirectory = new URL("./data/", import.meta.url);

/**
 * Other labels for every candidate of a base snapshot, such as blind labels. The scenario keeps
 * the base's assets, findings, observations, candidates, truth, and tags.
 */
export type LabelOverlay = Pick<FindingScenario, "id" | "suite"> & {
  base: string;
  batches: Record<
    string,
    { note: string; candidates: Record<string, ExpectedFindingMatch | undefined> }
  >;
};

/** Restores the Date fields JSON stores as strings; the evaluator validates the rest. */
function reviveDates(scenario: FindingScenario): FindingScenario {
  return {
    ...scenario,
    assets: scenario.assets.map((asset) => ({
      ...asset,
      createdAt: new Date(asset.createdAt),
      updatedAt: new Date(asset.updatedAt),
    })),
    findings: scenario.findings.map((finding) => ({
      ...finding,
      dueDate: finding.dueDate === null ? null : new Date(finding.dueDate),
      createdAt: new Date(finding.createdAt),
      updatedAt: new Date(finding.updatedAt),
    })),
    observations: scenario.observations.map((observation) => ({
      ...observation,
      observedAt: new Date(observation.observedAt),
      createdAt: new Date(observation.createdAt),
      updatedAt: new Date(observation.updatedAt),
    })),
    cases: scenario.cases.map((batch) => ({
      ...batch,
      candidates: batch.candidates.map((entry) => ({
        ...entry,
        candidate: {
          ...entry.candidate,
          observedAt:
            entry.candidate.observedAt === null ? null : new Date(entry.candidate.observedAt),
        },
      })),
    })),
  };
}

/** @throws An `Error` unless the overlay labels exactly the base's batches and candidates. */
export function applyOverlay(
  overlay: LabelOverlay,
  base: FindingScenario | undefined,
): FindingScenario {
  if (base === undefined) {
    throw new Error(`Label overlay ${overlay.id} names an unknown base snapshot.`);
  }
  if (Object.keys(overlay.batches).length !== base.cases.length) {
    throw new Error(`Label overlay ${overlay.id} must label every batch of ${base.id}.`);
  }
  return {
    ...structuredClone(base),
    id: overlay.id,
    suite: overlay.suite,
    cases: base.cases.map((batch) => {
      const labels = overlay.batches[batch.id];
      if (
        labels === undefined ||
        Object.keys(labels.candidates).length !== batch.candidates.length
      ) {
        throw new Error(`Label overlay ${overlay.id} must label every candidate of ${batch.id}.`);
      }
      return {
        ...structuredClone(batch),
        note: labels.note,
        candidates: batch.candidates.map((entry) => {
          const expected = labels.candidates[entry.id];
          if (expected === undefined) {
            throw new Error(`Label overlay ${overlay.id} misses ${batch.id}/${entry.id}.`);
          }
          return { ...structuredClone(entry), expected };
        }),
      };
    }),
  };
}

/** The hand-written edge suite plus the frozen replay snapshots and their label overlays. */
export async function loadDataset(): Promise<FindingDataset> {
  const files = (await readdir(dataDirectory)).filter((file) => file.endsWith(".json")).sort();
  const loaded = await Promise.all(
    files.map(
      async (file) =>
        JSON.parse(await readFile(new URL(file, dataDirectory), "utf8")) as
          | FindingScenario
          | LabelOverlay,
    ),
  );
  const snapshots = loaded.flatMap((entry) => ("base" in entry ? [] : [reviveDates(entry)]));
  const overlays = loaded.flatMap((entry) =>
    "base" in entry
      ? [
          applyOverlay(
            entry,
            snapshots.find((snapshot) => snapshot.id === entry.base),
          ),
        ]
      : [],
  );
  return {
    id: "finding-matching-v2",
    scenarios: [...edgeDataset.scenarios, ...snapshots, ...overlays],
  };
}
