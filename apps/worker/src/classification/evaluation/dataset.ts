import { readdir, readFile } from "node:fs/promises";

import { dataset as edgeDataset } from "./scenarios.js";

import type { EvaluationDataset, InventoryScenario } from "./evaluate.js";

const dataDirectory = new URL("./data/", import.meta.url);

/** Restores the Date fields JSON stores as strings; the evaluator validates the rest. */
function reviveDates(scenario: InventoryScenario): InventoryScenario {
  return {
    ...scenario,
    assets: scenario.assets.map((asset) => ({
      ...asset,
      createdAt: new Date(asset.createdAt),
      updatedAt: new Date(asset.updatedAt),
    })),
    cases: scenario.cases.map((entry) => ({
      ...entry,
      candidate: {
        ...entry.candidate,
        observedAt:
          entry.candidate.observedAt === null ? null : new Date(entry.candidate.observedAt),
      },
    })),
  };
}

/** The hand-written edge suite plus the frozen replay, generated, and held-out snapshots. */
export async function loadDataset(): Promise<EvaluationDataset> {
  const files = (await readdir(dataDirectory)).filter((file) => file.endsWith(".json")).sort();
  const snapshots = await Promise.all(
    files.map(async (file) =>
      reviveDates(
        JSON.parse(await readFile(new URL(file, dataDirectory), "utf8")) as InventoryScenario,
      ),
    ),
  );
  return { id: "asset-matching-v3", scenarios: [...edgeDataset.scenarios, ...snapshots] };
}
