# Finding Matcher Evaluation

The `finding-matching` kind of the [matcher evaluation harness](../README.md), comparing
`FindingMatcher` implementations with `pnpm eval:finding-matching`. The deterministic
`identity` matcher (`../../finding-classifiers/identity-matcher.ts`) is the only
registered offline matcher; it scores 24 of 24 edge candidates. `--help` lists the
scenarios.

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
`candidate`, an `expected` decision, and optional `tags`. Batches may carry a `note`
explaining the labels; notes appear in neither scoring nor reports.

Expected decisions:

- `{ status: "matched", findingIds }`: any listed finding is correct. List several only
  when the contract leaves the tie to the implementation, such as a `duplicate`
  finding and its canonical finding.
- `{ status: "new", group }`: candidates sharing a label must form exactly one new
  finding group. Labels are fixture-local; matchers' group keys are opaque.
- `{ status: "unresolved", reason }`: the labeled reason is required.

Besides the shared checks, the kind validates asset, finding, observation, and
candidate shapes, canonical weakness identifiers and fingerprints, that findings and
observations reference scenario records, and that expected findings exist on the
batch's asset.

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
Reports use schema version 1.

## Edge Suite

[scenarios.ts](scenarios.ts) contains 2 scenarios, 9 batches, and 24 hand-authored,
sanitized candidates: 15 expected matches, 6 new decisions in 5 groups, and 3
unresolved outcomes covering all three reasons. Existing scanner findings are
projections of the candidate that first reported them, the way finding seeding is
expected to work.

| Scenario             | Focus                                                                                                                                                                                                            |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `container-packages` | Trivy package findings: every terminal status, version drift, sibling candidates forming one group, one finding reported twice, a duplicate and its canonical finding, partial identity, another asset's finding |
| `source-code`        | Semgrep findings: fingerprints surviving line shifts, manually created findings with and without observations, title-only evidence, foreign fingerprint namespaces, conflicting evidence                         |

Labels follow [`finding-matcher.ts`](../../finding-matcher.ts) and the finding matching
PRD: status and origin never exclude a finding, finding identity never spans assets,
title similarity alone is insufficient, and fingerprints compare only within one
namespace. Weakness aliasing (CVE and GHSA) and cross-type affected resources are left
to implementations and not labeled. Edge labels reward useful decisions; one case
exercises one rule, so a perfect score says nothing about real scan streams.

There are no replay, generated, or held-out finding suites yet.
