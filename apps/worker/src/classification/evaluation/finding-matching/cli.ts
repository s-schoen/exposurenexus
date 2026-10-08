import { runEvaluationCommand } from "../command.js";
import { loadDataset } from "./dataset.js";
import { findingMatching } from "./evaluate.js";
import { matchers } from "./matchers.js";

try {
  process.exitCode = await runEvaluationCommand(
    process.argv.slice(2),
    findingMatching,
    loadDataset,
    matchers,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : "Evaluation failed.");
  process.exitCode = 1;
}
