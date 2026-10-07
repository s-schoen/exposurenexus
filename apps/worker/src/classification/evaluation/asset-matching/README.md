# Asset Matcher Evaluation

The `asset-matching` kind of the [matcher evaluation harness](../README.md), comparing
`AssetMatcher` implementations with `pnpm eval:asset-matching`. The deterministic
`identifier` matcher (`../../asset-classifiers/identifier-matcher.ts`) is the only
registered offline matcher. Factories in [matchers.ts](matchers.ts) receive only a
cloned asset inventory; each case is one `match(candidate)` call.

Results come from four suites that answer different questions. Read them together;
the edge suite alone overstates real-world quality.

| Suite       | Scenarios                                        | Question it answers                                               |
| ----------- | ------------------------------------------------ | ----------------------------------------------------------------- |
| `edge`      | `network`, `repositories-images`, `cloud-scoped` | Does each specified rule hold? Hand-written regression cases.     |
| `replay`    | `replay-fixtures`, `replay-lab`                  | What happens to real scanner output run through real normalizers? |
| `generated` | `generated-small`, `-medium`                     | How do drift, aliases, and distractors affect it?                 |
| `heldout`   | `heldout-generated`, `heldout-replay`            | Do blind, implementation-independent labels agree? Opt-in only.   |

## Edge Suite

[scenarios.ts](scenarios.ts) contains 31 hand-authored, sanitized cases: 19 desired
asset assignments and 12 unresolved outcomes. All five identifier types and all
four unresolved reasons are represented. One case exercises one rule, so frequencies
are unrealistic and a perfect score here says nothing about coverage on real scans.

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

## Frozen Snapshots

The `replay`, `generated`, and `heldout` suites are frozen snapshots in
[data/](data), one JSON file per scenario holding a serialized `InventoryScenario`.
Dates are stored as ISO strings and restored on load. Snapshot candidates predate
source fingerprints and load with empty `fingerprints`. Everything else is validated
like the edge suite. Each case's `note` explains its labels. Snapshots are never
regenerated: like the edge corpus, they do not follow later normalizer changes.

| Scenario            | Assets | Cases | Candidates | Contents                                                                           |
| ------------------- | -----: | ----: | ---------: | ---------------------------------------------------------------------------------- |
| `replay-fixtures`   |      8 |     9 |      1,560 | Real normalizer output for the committed fixtures in `../../normalizers/fixtures/` |
| `replay-lab`        |      6 |    11 |        300 | Real normalizer output for scans of a local lab with known targets                 |
| `generated-small`   |    121 |   150 |        150 | Synthetic inventory with drift, aliases, and distractors                           |
| `generated-medium`  |  1,137 |   400 |        400 | The same at a larger inventory size                                                |
| `heldout-generated` |     86 |    40 |         40 | Unseen synthetic cases labeled blind; opt-in with `--suite heldout`                |
| `heldout-replay`    |      8 |     9 |      1,560 | The replay fixtures labeled blind; opt-in with `--suite heldout`                   |

### Provenance

The snapshots were produced once, in October 2026, by tooling that is no longer part
of the repository:

- **Replay.** Scanner files went through the production normalizers. Candidates with
  identical identity evidence (identifier candidates plus host, repository, registry,
  and cloud fields) were collapsed into one case whose `weight` is their count, so
  matchers that read free text see only one representative per group. Ground truth
  is the asset each scan targeted, as its operator knew it.
  - `replay-fixtures` uses the normalizer fixtures: Nuclei and ZAP against a local
    Juice Shop, Semgrep and Bearer over Juice Shop sources, Trivy, Checkov, and KICS
    over a TerraGoat Terraform tree, and Trivy image and repository scans. Its
    inventory names the real deployment and repositories rather than scan endpoints
    and includes an archived loopback record of the kind CMDB imports leave behind.
  - `replay-lab` uses a pinned local lab: Juice Shop v20.2.0 and an nginx status page
    scanned by inventory alias and through `localhost`, `nginx:1.31.6-alpine` scanned
    by qualified and short name, Juice Shop sources scanned as a repository and as a
    checkout, and a Terraform sample. Scanners were Nuclei 3.11.1, ZAP 2.17.0,
    Trivy 0.75.0, Semgrep 1.179.0, and Checkov 3.3.22.
- **Generated.** A seeded generator (seeds 1 and 2) built background inventories of
  hosts, repositories, images, and cloud resources, then drew weighted case recipes:
  mostly clean identities plus noise, aliases, scope ambiguity, and drift. Labels
  follow the specification and recorded product decisions; where the specification
  expects a decision current matchers cannot make, the case carries a `knownGap`.
- **Held-out.** A separate labeler that saw only `CONTEXT.md`, `../../asset-matcher.ts`,
  and the raw candidates and inventories wrote the expected decisions for cases from
  an otherwise unused generator seed (99) and for the replay fixtures. Its rationale
  is each case's note. Truth and tags come from the source. Review disagreements
  between blind and source labels as specification questions before changing either.

### Updating Snapshots

Edit data files directly, keeping identifiers canonical and adding or updating each
affected case's `note`. New realistic cases can be appended in the same shape; the
evaluator rejects noncanonical, duplicate, or dangling data when the dataset loads.

## Case Metadata

Fixture types reuse `Asset` and `ObservationCandidate`. Besides the shared checks,
the kind validates expected outcomes and target membership, inventory and candidate
shape, canonical weakness/identifiers, and per-scenario identifier uniqueness.
Candidate identifier duplicates remain valid; the classifier may preserve them.
Inventory snapshots can be empty.

Cases may also carry:

- `truthAssetId`: the asset the subject really is, which inventory drift can hide
  from any matcher; `null` when the subject is not in inventory. It defaults to the
  expected asset of an expected match and stays unknown otherwise. `expected`
  remains the correct decision given only the evidence.
- `acceptable`: other unresolved decisions the contract permits. They score as
  `acceptable_alternative`: correct, but not coverage.
- `tags`: breakdown labels such as `drift:stale-ip`. Every case also gets
  `source:<scanner>` and `evidence:explicit|context|none`, derived from field
  presence rather than from any matcher.
- `knownGap`: why current matchers are expected to fail. Reports track open and
  closed known gaps; other failures are listed as unexpected.
- `weight`: how many source candidates the case stands for.
- `note`: why the labels are what they are. Notes are for reviewers and appear in
  neither scoring nor reports.

## Interpret Results

Each case is a correct assignment, wrong assignment, missed match, correctly
unresolved, acceptable alternative, incorrect unresolved reason, execution error, or
not run after a setup failure. A correct unresolved decision requires the labeled reason; explanation
wording is not graded. Assigning a nonexistent asset is still a wrong assignment,
not a sample to omit from precision. Invalid result shapes are execution errors.

Assignment precision is correct assignments divided by all assignments. Match
recall is correct assignments divided by all expected assignments, including cases
that errored or could not run.

Precision and recall grade decisions against the evidence. Two further rates grade
them against reality, and are where realistic suites differ most:

- Coverage: weighted assignments to `truthAssetId` divided by weighted cases with a
  known, non-null truth. Missing evidence, aliases, and drift all lower it.
- Misattribution rate: weighted assignments to anything but the known truth,
  including evidence-correct assignments that inventory drift makes wrong.

Summaries report unweighted counts at the top level and candidate-weighted counts
under `weighted`, plus a candidate-weighted expected-versus-actual `confusion`
matrix, per-tag statistics (`uncovered` counts subjects whose real asset was not
assigned), known-gap status, and unexpected failures. The console adds coverage and
misattribution columns and a gap summary per matcher; JSON has the full detail.

Reports use schema version 2. Generated frequencies are a plausible model of a scan
stream, not measured production data. Edge labels reward useful matches even where the contract also permits abstention;
other suites record such abstentions as `acceptable`.
