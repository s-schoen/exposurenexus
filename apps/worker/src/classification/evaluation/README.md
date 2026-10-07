# Matcher Evaluation

Standalone comparison of matcher implementations against labeled fixtures. It never
connects to the application database or participates in worker ingestion. One shared
runner ([harness.ts](harness.ts)) and command ([command.ts](command.ts)) serve each
matcher contract, called a kind:

| Kind                                  | Command                      | Contract                                  |
| ------------------------------------- | ---------------------------- | ----------------------------------------- |
| [asset-matching](asset-matching/)     | `pnpm eval:asset-matching`   | [`AssetMatcher`](../asset-matcher.ts)     |
| [finding-matching](finding-matching/) | `pnpm eval:finding-matching` | [`FindingMatcher`](../finding-matcher.ts) |

Each kind's README describes its fixtures, suites, and scoring. A kind supplies
fixture validation, the fixture its factories receive, how one case calls the matcher,
result validation, scoring, and console columns; the runner owns everything below.

## Run

From the repository root, for either kind:

```sh
pnpm eval:asset-matching --help
pnpm eval:asset-matching
pnpm eval:asset-matching --suite replay
pnpm eval:asset-matching --suite heldout
pnpm eval:asset-matching --matcher identifier --scenario network
pnpm eval:asset-matching --matcher identifier --output evaluation-results/local.json
pnpm eval:asset-matching --matcher YOUR_LIVE_MATCHER --allow-network
```

The root command builds workspace dependencies before invoking the worker's `tsx`
entrypoint. Repeat `--matcher`, `--suite`, or `--scenario` to select multiple
entries; duplicate selections are evaluated only once. Defaults are all registered
offline matchers and the `edge`, `replay`, and `generated` suites. `--scenario`
searches every suite unless `--suite` is also given. `--allow-network` alone never
selects a live matcher. All suites load from committed data; nothing is generated
or normalized at run time.

Relative output paths are relative to the worker workspace. By default, reports
are timestamped JSON files named after the kind in ignored
`apps/worker/evaluation-results/`. Existing files are never overwritten; choose a
new path for each run. Files are created with owner-only permissions. A failed
configuration leaves no report behind.

Exit code 0 means evaluation completed, not that matching quality was good.
Configuration errors, missing matchers, setup errors, thrown calls, or malformed
results produce a nonzero exit. Completed evaluations save their report before
returning an error exit code. There are no accuracy or latency gates.

## Add A Matcher

Add a named factory entry to the kind's `matchers.ts`. Its `create(fixture)` receives
only the kind's cloned fixture and returns a matcher, synchronously or asynchronously.
Adapt that fixture to the implementation's own read-only dependencies; do not add a
production interface for the evaluator.

Keep imports and registration free of initialization side effects. Construct all
dependencies inside `create`, and return a fresh matcher each time. The evaluator
shares that instance across one scenario's cases, never across scenarios or
implementations. Matchers receive cloned inputs and a silent logger, not case IDs,
expected outcomes, or fixture-author notes.

Declare `requiresNetwork` explicitly. Network-backed factories require selection
by name plus `--allow-network`. Configure finite dependency timeouts in the
factory; the harness cannot cancel `match()` and does not race it against a timer.
No hidden warmups, repetitions, retries, or concurrent calls are performed.

Optional `metadata` is an explicit string map for non-secret identifiers such as
model/version or a prompt/configuration fingerprint. Do not copy environment
variables, credentials, prompts, or SDK configuration into it. Explanations must
obey the matcher's log-safe contract. Caught exceptions are replaced with generic
setup/call failure messages; raw messages, stacks, and response bodies are omitted.

## Validation, Timing, And Reports

Before setup, the runner checks that the dataset is cloneable and serializable, that
dataset, scenario, and case IDs are valid and unique, that suites are known, and that
datasets and scenarios are not empty. The kind then validates its own fixtures.
Expectations are authored independently of any implementation and never inferred by
the evaluator.

A thrown call or a result that fails the kind's validation is a failed call; the
kind scores its case as an execution error. Setup failures mark the result
incomplete and retain all planned cases as not run. Empty metric denominators are
`null` in JSON and `N/A` in the console. Overall percentages use pooled counts, not
averages of scenario percentages.

Timing uses a monotonic clock around factory setup and each awaited `match()`.
Fixture cloning, validation, scoring, fixture loading, Git metadata, and reporting
are outside those measurements. Setup, completed calls, and failed calls have
separate timing summaries. Median uses the middle value or mean of the middle pair;
p95 uses nearest rank. Samples and totals are retained without rounding in JSON.

Reports carry the kind's schema version, a full-dataset SHA-256 fingerprint, selected
matchers/scenarios, source revision/dirty state when available, runtime information,
summaries, and individual decisions/timings. They contain neither candidates nor
fixture dumps. Compare runs with the same dataset fingerprint, selections, runtime
conditions, and declared matcher configuration.

One pass is descriptive, not a statistically stable LLM evaluation. There is no
composite score, automatic winner, historical baseline comparison, or dashboard.

Evaluator and dataset unit tests use test-only fake matchers. Concrete matcher unit
tests exercise their public matching interface separately. None of them grade a real
matcher on these suites, make paid calls, or enforce thresholds.
