# Asset Matcher Evaluation

Standalone comparison of `AssetMatcher` implementations on a controlled inventory
and normalized candidates. It does not run normalizers, connect to the application
database, or participate in worker ingestion. The deterministic `identifier` matcher
(`../asset-classifiers/identifier-matcher.ts`) is the only registered offline matcher.

## Run

From the repository root:

```sh
pnpm eval:asset-matching --help
pnpm eval:asset-matching
pnpm eval:asset-matching --matcher identifier --scenario network
pnpm eval:asset-matching --matcher identifier --output evaluation-results/local.json
pnpm eval:asset-matching --matcher YOUR_LIVE_MATCHER --allow-network
```

The root command builds workspace dependencies before invoking the worker's `tsx`
entrypoint. Repeat `--matcher` or `--scenario` to select multiple entries; duplicate
selections are evaluated only once. Defaults are all registered offline matchers
and all scenarios. `--allow-network` alone never selects a live matcher.

Relative output paths are relative to the worker workspace. By default, reports
are timestamped JSON files in ignored `apps/worker/evaluation-results/`. Existing
files are never overwritten; choose a new path for each run. Files are created
with owner-only permissions. A failed configuration leaves no report behind.

Exit code 0 means evaluation completed, not that matching quality was good.
Configuration errors, missing matchers, setup errors, thrown calls, or malformed
results produce a nonzero exit. Completed evaluations save their report before
returning an error exit code. There are no accuracy or latency gates.

## Add A Matcher

Add a named `MatcherFactory` entry to [matchers.ts](matchers.ts). Its `create(assets)`
receives only a cloned inventory and returns an `AssetMatcher`, synchronously or
asynchronously. Adapt that inventory to the implementation's own read-only
dependencies; do not add a production inventory interface for the evaluator.

Keep imports and registration free of initialization side effects. Construct all
dependencies inside `create`, and return a fresh matcher each time. The evaluator
shares that instance across one scenario's cases, never across scenarios or
implementations. Matchers receive cloned candidates and a silent logger, not case
IDs, expected outcomes, or fixture-author notes.

Declare `requiresNetwork` explicitly. Network-backed factories require selection
by name plus `--allow-network`. Configure finite dependency timeouts in the
factory; the harness cannot cancel `match()` and does not race it against a timer.
No hidden warmups, repetitions, retries, or concurrent calls are performed.

Optional `metadata` is an explicit string map for non-secret identifiers such as
model/version or a prompt/configuration fingerprint. Do not copy environment
variables, credentials, prompts, or SDK configuration into it. Explanations must
obey the matcher's log-safe contract. Caught exceptions are replaced with generic
setup/call failure messages; raw messages, stacks, and response bodies are omitted.

## Corpus

[scenarios.ts](scenarios.ts) contains 31 hand-authored, sanitized cases: 19 desired
asset assignments and 12 unresolved outcomes. All five identifier types and all
four unresolved reasons are represented.

| Scenario              | Assets | Cases | Focus                                                                                                                                       |
| --------------------- | -----: | ----: | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `network`             |      5 |    10 | DNS/IP agreement, partial hits, conflicts, redirected context, archived assets, absent targets, insufficient evidence, short hostnames      |
| `repositories-images` |      6 |    11 | VCS/OCI identity, source/package context, case sensitivity, contextual inference, ambiguity, server-less repositories, registry-less images |
| `cloud-scoped`        |      9 |    10 | Cloud identities, account ambiguity, case-sensitive values/namespaces, global versus scoped identifiers, unscoped namespace fallback        |

Field shapes are informed by the Nuclei, Semgrep, Trivy, and Checkov normalizers;
source comments record provenance and label rationale. Explicit repository/cloud
context and namespace assignments include deliberate synthetic enrichments. They
are valid matcher inputs, not claims about what today's normalizers emit. Inputs
use fictional inventory names, example domains, and documentation IP ranges, not
verbatim scan records. Changes to normalizers do not regenerate this corpus.

Fixture types reuse `Asset` and `ObservationCandidate`. Before setup, the evaluator
checks serialization, IDs, expected outcomes and target membership, inventory and
candidate shape, canonical weakness/identifiers, and per-scenario identifier uniqueness. Candidate identifier
duplicates remain valid; the classifier may preserve them. Inventory snapshots
can be empty, but datasets must contain scenarios and scenarios must contain cases. Expectations are
authored independently of any implementation and never inferred by the evaluator.

## Interpret Results

Each case is a correct assignment, wrong assignment, missed match, correctly
unresolved, incorrect unresolved reason, execution error, or not run after a setup
failure. A correct unresolved decision requires the labeled reason; explanation
wording is not graded. Assigning a nonexistent asset is still a wrong assignment,
not a sample to omit from precision. Invalid result shapes are execution errors.

Assignment precision is correct assignments divided by all assignments. Match
recall is correct assignments divided by all expected assignments, including cases
that errored or could not run. Empty denominators are `null` in JSON and `N/A` in
the console. Overall percentages use pooled counts, not averages of scenario
percentages. Setup failures mark the result incomplete and retain all planned cases.

Timing uses a monotonic clock around factory setup and each awaited `match()`.
Inventory/candidate cloning, validation, scoring, fixture loading, Git metadata,
and reporting are outside those measurements. Setup, completed calls, and failed
calls have separate timing summaries. Median uses the middle value or mean of the
middle pair; p95 uses nearest rank. Samples and totals are retained without
rounding in JSON. Console `errors` combines call and setup failure counts.

Reports include a schema version, full-dataset SHA-256 fingerprint, selected
matchers/scenarios, source revision/dirty state when available, runtime information,
summaries, and individual decisions/timings. They contain neither candidates nor
inventory dumps. Compare runs with the same dataset fingerprint, selections,
runtime conditions, and declared matcher configuration.

One pass over small, heterogeneous cases is descriptive, not a production scaling
benchmark or a statistically stable LLM evaluation. Dataset labels reward useful
matches even where the matcher contract also permits abstention. There is no
composite score, automatic winner, historical baseline comparison, or dashboard.

Evaluator unit tests use test-only fake matchers. Concrete matcher unit tests
exercise their public matching interface separately. Neither runs this corpus,
paid calls, or performance thresholds.
