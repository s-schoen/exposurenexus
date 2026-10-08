# Finding Matcher Evaluation

The `finding-matching` kind of the [matcher evaluation harness](../README.md), comparing
`FindingMatcher` implementations with `pnpm eval:finding-matching`. The deterministic
`identity` matcher (`../../finding-classifiers/identity-matcher.ts`) is the only
registered offline matcher. `--help` lists the scenarios.

Results come from three suites that answer different questions. Read them together;
the edge suite alone overstates real-world quality.

| Suite     | Scenarios                           | Question it answers                                             |
| --------- | ----------------------------------- | --------------------------------------------------------------- |
| `edge`    | `container-packages`, `source-code` | Does each specified rule hold? Hand-written regression cases.   |
| `replay`  | `replay-fixtures`, `replay-lab`     | What happens when real scanner output rescans real targets?     |
| `heldout` | `heldout-replay`                    | Do blind, implementation-independent labels agree? Opt-in only. |

## Fixtures

A scenario holds assets, the existing findings on them, and those findings'
observations. Factories in [matchers.ts](matchers.ts) receive a cloned
`{ assets, findings, observations }` fixture and adapt it to the implementation's own
read-only finding dependencies; the `identity` factory lists an asset's findings with
their observations' fingerprints merged per finding.

- Findings are `findingRecordSchema` records: finding-owned identity (`weakness`,
  finding `affectedResource`) and workflow (`status`), without catalog joins or
  aggregates.
- Observations are persisted observation records. The contracts admit only manual
  observations so far, so the fixture widens `source` to a scanner name and adds an
  `ingestionId`, which is null exactly for `manual` observations. They carry
  `fingerprints` as ticket 02 persists them.
- A finding without observations models a manually created finding whose identity
  lives only on the finding.

Each case is one batch, one `match(assetId, candidates)` call holding every candidate
of one ingestion on one asset. Each candidate entry has a batch-unique `id`, the
`candidate`, an `expected` decision, optional `truthFindingIds`, and optional `tags`.
Batches may carry a `note` explaining the labels; notes appear in neither scoring nor
reports.

Expected decisions:

- `{ status: "matched", findingIds }`: any listed finding is correct. List several only
  when the contract leaves the tie to the implementation, such as a `duplicate`
  finding and its canonical finding.
- `{ status: "new", group }`: candidates sharing a label must form exactly one new
  finding group. Labels are fixture-local; matchers' group keys are opaque.
- `{ status: "unresolved", reason }`: the labeled reason is required.

`expected` grades a decision against the evidence. `truthFindingIds` records reality:
the existing findings the detection really continues, any of which counts, or `null`
when it is truly new. It is absent when unknown and is never inferred from `expected`.
The two differ where the evidence falls short of reality, such as a moved source code
result whose span also changed: it may be expected `ambiguous`, yet continue an existing
finding.

Besides the shared checks, the kind validates asset, finding, observation, and
candidate shapes, canonical weakness identifiers and fingerprints, that findings and
observations reference scenario records, and that expected and truth findings exist on
the batch's asset.

## Scoring

Scoring is per candidate, because results are index-aligned per candidate. A batch
that throws, returns the wrong number of decisions, or returns an invalid shape fails
as a whole: all its candidates are execution errors, matching the contract's
no-partial-results rule.

| Outcome                       | Expected              | Actual                                     |
| ----------------------------- | --------------------- | ------------------------------------------ |
| `correct_match`               | matched               | one of the expected findings               |
| `wrong_match`                 | any                   | any other finding                          |
| `missed_match`                | matched               | unresolved                                 |
| `correct_new`                 | new                   | new, with exactly the expected group peers |
| `wrong_grouping`              | new                   | new, with a split or merged group          |
| `unexpected_new`              | matched or unresolved | new                                        |
| `missed_new`                  | new                   | unresolved                                 |
| `correctly_unresolved`        | unresolved            | unresolved, same reason                    |
| `incorrect_unresolved_reason` | unresolved            | unresolved, other reason                   |

New groups compare as a partition: a `new` decision is correct when the candidates
sharing its key are exactly the candidates sharing its expected label, whatever the
key values are. An `unexpected_new` where a match was expected would create a
duplicate finding.

Match precision is correct matches divided by all matches; match recall is correct
matches divided by expected matches. New precision is correct new decisions divided
by all new decisions; new recall is correct new decisions divided by expected new
decisions. Recall denominators include errored and not-run candidates.

Matches on another asset's finding (`otherAssetMatches`) and on finding IDs absent
from the fixture (`nonexistentMatches`) break hard contract invariants. They count as
wrong matches and are also reported separately. Summaries add an expected-versus-actual
`confusion` matrix (`new:regrouped` marks wrong groupings, `matched:other` wrong
matches), per-tag statistics, and the failing candidates as
`scenario/batch/candidate`. Every candidate gets a derived `source:<scanner>` tag.
Reports use schema version 2.

Three rates grade decisions against truth rather than evidence:

- Continuity: candidates matched to a finding they really continue, divided by
  candidates whose truth names existing findings.
- Duplicate rate: continuing candidates decided `new`, each of which would create a
  duplicate finding, divided by the same denominator.
- Misattribution rate: matches on anything but the known truth, including
  evidence-correct matches that drift makes wrong, divided by all candidates.

Per-tag statistics count duplicates and misattributions, and the console lists the tags
that lose the most.

## Edge Suite

[scenarios.ts](scenarios.ts) contains 3 scenarios, 14 batches, and 37 hand-authored,
sanitized candidates: 22 expected matches, 8 new decisions in 7 groups, and 7
unresolved outcomes covering all three reasons. Existing scanner findings are
projections of the candidate that first reported them, the way finding seeding is
expected to work.

| Scenario             | Focus                                                                                                                                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `container-packages` | Trivy package findings: every terminal status, version drift, sibling candidates forming one group, one finding reported twice, a duplicate and its canonical finding, partial identity, another asset's finding         |
| `source-code`        | Semgrep findings: fingerprints surviving line shifts, manually created findings with and without observations, title-only evidence, foreign fingerprint namespaces, conflicting evidence                                 |
| `source-drift`       | Drift pairing without fingerprints: Bearer results shifting together, an indentation change, a fix next to a new result, leftovers with and without an unpaired finding, a resized Checkov block, a fingerprint conflict |

Labels follow [`finding-matcher.ts`](../../finding-matcher.ts) and the finding matching
PRD: status and origin never exclude a finding, finding identity never spans assets,
title similarity alone is insufficient, and fingerprints compare only within one
namespace. Weakness aliasing (CVE and GHSA) and cross-type affected resources are left
to implementations and not labeled. Edge labels reward useful decisions; one case
exercises one rule, so a perfect score says nothing about real scan streams.

## Frozen Snapshots

The `replay` and `heldout` suites are frozen snapshots in [data/](data). Each replay file
holds one serialized `FindingScenario`; dates are stored as ISO strings and restored on
load. Snapshots are never regenerated and do not follow later normalizer changes.

| Scenario          | Batches | Candidates | Findings | Contents                                                                     |
| ----------------- | ------: | ---------: | -------: | ---------------------------------------------------------------------------- |
| `replay-fixtures` |       9 |      1,560 |    1,539 | Unchanged rescans of the committed fixtures in `../../normalizers/fixtures/` |
| `replay-lab`      |       6 |      1,666 |    1,633 | Rescans of two real target versions, with line, file, and version drift      |
| `heldout-replay`  |       6 |      1,666 |    1,633 | `replay-lab` labeled blind; opt-in with `--suite heldout`                    |

### Provenance

The snapshots were produced once, in October 2026, by tooling that is not part of the
repository. Scanner files went through the production normalizers. Each scanner's first
scan seeded the existing findings: one active finding per domain identity, meaning equal
canonical weakness identifiers and an equal finding-projected affected resource, with
every first-scan candidate as an observation of its finding. Scanners seeded
independently, so a weakness two scanners report stays two findings, as it would before
an analyst merges them. The second scan of each scanner is one batch.

To keep the files small, candidates and observations drop `description`, `evidence`,
`remediation`, and `sourceMetadata` (which embeds whole scan documents), and weaknesses
keep only their identifiers. Titles, affected resources, and fingerprints stay exactly as
the normalizers emitted them.

- `replay-fixtures` replays each committed fixture as its own next scan: Nuclei and ZAP
  against Juice Shop, Semgrep and Bearer over Juice Shop sources, Checkov, KICS, and Trivy
  over TerraGoat, and Trivy over a test image and a test repository. Its assets are those
  of the asset `replay-fixtures` snapshot. Truth is the finding seeded from the same
  record.
- `replay-lab` rescans real changes:
  - Semgrep 1.179.0 (`p/default`) and Bearer 2.1.1 over Juice Shop sources v20.1.1, then
    v20.2.0.
  - Checkov 3.3.22, KICS 2.1.20, and Trivy 0.75.0 over TerraGoat's `terraform/` tree at
    2a0761f (April 2022), then 729f8da (April 2023).
  - Trivy 0.75.0 over the `bkimminich/juice-shop` images v20.1.1, then v20.2.0, with one
    vulnerability database (updated 2026-10-07) for both.

  Truth comes from scanner-native record keys:
  - Code scanners: the same rule at the path and line mapped through the git diff between
    the two versions.
  - IaC scanners: the same check on the same resource or KICS search key in the mapped
    file, narrowed by the mapped line when needed.
  - Image scanner: the same vulnerability in the same package and package path.

  Truth is unknown when a result sits on a rewritten line and the same rule flagged a
  rewritten old line.

- Expected decisions in both replay scenarios follow the identity rules recorded for the
  `identity` matcher:
  - same weakness: every shared specific namespace overlaps, and CWE counts only against a
    CWE-only side
  - same finding-owned resource: for source code, the location counts, with columns and end
    lines where both sides have them
  - otherwise drift pairing: an unclaimed finding of the same weakness, file, and symbol, in
    file order by span shape, or by equal width or a shared symbol when it is alone in a gap
  - a leftover result is `ambiguous` while its file keeps an unpaired finding of its weakness,
    and otherwise `new`, grouped by equal identity

  A labeling script outside the repository wrote these labels from the written rules,
  never by running the matcher.

  Agreement with that matcher is therefore expected. The truth rates and the blind labels
  are the independent signal.

- `heldout-replay` is a label overlay: it names `replay-lab` as its `base` and supplies
  other expected decisions and batch notes for every candidate. Assets, findings,
  observations, candidates, truth, and tags come from the base. A separate labeler wrote
  the labels after seeing only `CONTEXT.md`, `../../finding-matcher.ts`, the candidate type,
  and the unlabeled scenario. Review disagreements between blind and replay labels as
  specification questions before changing either.

Tags record truth and drift relative to the continued finding:

- truth: `truth:continued`, `truth:new`, `truth:unknown`
- drift: `drift:none`, `drift:line`, `drift:file`, `drift:path`, `drift:version`,
  `drift:identifiers`

### Updating Snapshots

Edit data files directly, keeping identifiers canonical and updating the affected
batch's `note`. The evaluator rejects noncanonical, duplicate, or dangling data, and the
loader rejects an overlay that does not label exactly its base's candidates.
