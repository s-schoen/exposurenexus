import { runEvaluationCommand } from "../command.js";
import { findingMatching } from "./evaluate.js";
import { matchers } from "./matchers.js";
import { dataset } from "./scenarios.js";

try {
  process.exitCode = await runEvaluationCommand(
    process.argv.slice(2),
    findingMatching,
    dataset,
    matchers,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : "Evaluation failed.");
  process.exitCode = 1;
}
