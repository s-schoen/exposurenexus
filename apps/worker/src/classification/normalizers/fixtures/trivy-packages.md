# Trivy Package Vulnerability Fixtures

## Provenance

These are complete upstream Trivy integration-test golden reports, not newly captured scans.
Both come from `aquasecurity/trivy` commit `591e9799316a602e703f0b484f6c6d7b234ec8f3`
(the PRD's v0.75.0 source pin). The reports themselves say `Trivy.Version: "dev"`; that value
is retained and must not be interpreted as a captured v0.75.0 release run.

Changes from upstream: local filenames and JSON formatting only. No records or fields were
excerpted, omitted, added, or changed; no envelope, timestamp, identity, or scan context was
constructed. In particular, the clean language result and complete image/Git metadata are retained.
Before formatting, both local files matched the upstream Git blob IDs below byte for byte.
All data is local: consuming these fixtures needs no network, Trivy executable, vulnerability
database, source checkout, or access to Downloads. Referenced URLs are source data, not runtime inputs.

| Local file            | Upstream path                                 | Upstream Git blob ID                       |
| --------------------- | --------------------------------------------- | ------------------------------------------ |
| `trivy-alpine.json`   | `integration/testdata/alpine-310.json.golden` | `ad2b3df4e92ea0f93a1373d9524ac9bf40e8308d` |
| `trivy-language.json` | `integration/testdata/test-repo.json.golden`  | `346b41eb7516879d06a3da97f2d20dc8fedeaed7` |

Exact pinned sources:

- [Alpine JSON](https://github.com/aquasecurity/trivy/blob/591e9799316a602e703f0b484f6c6d7b234ec8f3/integration/testdata/alpine-310.json.golden)
- [Alpine raw JSON](https://raw.githubusercontent.com/aquasecurity/trivy/591e9799316a602e703f0b484f6c6d7b234ec8f3/integration/testdata/alpine-310.json.golden)
- [Language/repository JSON](https://github.com/aquasecurity/trivy/blob/591e9799316a602e703f0b484f6c6d7b234ec8f3/integration/testdata/test-repo.json.golden)
- [Language/repository raw JSON](https://raw.githubusercontent.com/aquasecurity/trivy/591e9799316a602e703f0b484f6c6d7b234ec8f3/integration/testdata/test-repo.json.golden)
- [Upstream LICENSE](https://github.com/aquasecurity/trivy/blob/591e9799316a602e703f0b484f6c6d7b234ec8f3/LICENSE)
- [Upstream NOTICE](https://github.com/aquasecurity/trivy/blob/591e9799316a602e703f0b484f6c6d7b234ec8f3/NOTICE)

## Public-Test Facts

Both reports have numeric `SchemaVersion: 2`, `CreatedAt: "2021-08-25T12:20:30.000000005Z"`
(JavaScript Date precision: `2021-08-25T12:20:30.000Z`), and
`ReportID: "017b7d41-e09f-7000-80ea-000000000001"`. All six vulnerabilities have
`Status: "fixed"`, a PURL, title, description, primary URL, CWE, CVSS, references, and fixed-version
text. None has `PkgPath` or `VendorIDs`. Neither report contains package inventory, misconfigurations,
or suppressed findings. Counts below are input facts and expected candidate counts, not a claim that
normalizer/classifier tests have already passed.

### Alpine

- Artifact type: `container_image`; one result, `Class: "os-pkgs"`, `Type: "alpine"`.
- Four vulnerabilities, all `MEDIUM`; two distinct CVEs across two distinct packages. Keep all four.
- Every installed version is `1.1.1c-r0`; all four PURLs have type `apk`.
- `Metadata.Reference` and the sole `Metadata.RepoTags` entry both equal
  `ghcr.io/aquasecurity/trivy-test-images:alpine-310`. They identify one image repository:
  `ghcr.io/aquasecurity/trivy-test-images`.
- `ArtifactName` is `testdata/fixtures/images/alpine-310.tar.gz`, not an image repository reference.
- Result target is `testdata/fixtures/images/alpine-310.tar.gz (alpine 3.10.2)`; it must not become
  an installation path. No detection supplies an installation path.
- Every record contains NVD v2 score `5`, NVD v3.1 score `5.3`, and Red Hat v3 score `4.8`:
  three distinct assessments per candidate. Red Hat uses v3.0 for CVE-2019-1549 and v3.1 for
  CVE-2019-1551. Preserve both vendor maps and their differing vectors.
- CVE-2019-1549 records each have 20 references; CVE-2019-1551 records each have 30.
  Their primary URLs are not in those arrays, yielding 21/31 references when prepended.

All locators below are under `/Results/0/Vulnerabilities/`:

| Index | Package        | Vulnerability ID | FixedVersion | CWE       |
| ----- | -------------- | ---------------- | ------------ | --------- |
| 0     | `libcrypto1.1` | `CVE-2019-1549`  | `1.1.1d-r0`  | `CWE-330` |
| 1     | `libcrypto1.1` | `CVE-2019-1551`  | `1.1.1d-r2`  | `CWE-200` |
| 2     | `libssl1.1`    | `CVE-2019-1549`  | `1.1.1d-r0`  | `CWE-330` |
| 3     | `libssl1.1`    | `CVE-2019-1551`  | `1.1.1d-r2`  | `CWE-200` |

### Language Packages

- Artifact type: `repository`; two results, both `Class: "lang-pkgs"`.
- Result 0: `Target: "Cargo.lock"`, `Type: "cargo"`, two vulnerabilities for `ammonia` version
  `1.9.0`, both with `PkgIdentifier.PURL: "pkg:cargo/ammonia@1.9.0"` (ecosystem `cargo`).
- Result 1: `Target: "Pipfile.lock"`, `Type: "pipenv"`, no `Vulnerabilities` array; zero candidates.
  This is a clean Python result, not evidence of a Python vulnerability.
- `ArtifactName` and `Metadata.RepoURL` both equal `https://github.com/knqyf263/trivy-ci-test`.
  The Git revision is `5ae342eb2802672402d9b2c26f09e2051bbd91b8`, distinct from the Trivy source pin.
- Neither manifest target is an installation path. There are no explicit package paths.
- Each record has two NVD assessments. Index 0: v2 score `5`, v3.0 score `7.5`.
  Index 1: v2 score `4.3`, v3.1 score `6.1`.
- Reference counts are 3 and 4; primary URLs are absent from the arrays, yielding 4 and 5 when
  prepended. RustSec advisory links are references, not explicit `VendorIDs` aliases.

All locators below are under `/Results/0/Vulnerabilities/`. Fixed-version values are decoded JSON
strings; the source uses Unicode escapes for comparison signs.

| Index | Vulnerability ID | Severity | FixedVersion                  | CWE       |
| ----- | ---------------- | -------- | ----------------------------- | --------- |
| 0     | `CVE-2019-15542` | `HIGH`   | `>= 2.1.0`                    | `CWE-674` |
| 1     | `CVE-2021-38193` | `MEDIUM` | `>= 3.1.0, >= 2.1.3, < 3.0.0` | `CWE-79`  |

### Coverage Boundaries

These unchanged upstream examples cover OS/application packages, explicit image/repository context,
absent package paths, repeated CVEs across packages, multi-vendor CVSS, v2/v3.0/v3.1, and exact
multi-version fix guidance. They do not cover filesystem package scans, explicit package paths,
GHSA/native-vendor primary IDs or aliases, missing/malformed PURLs, missing fixes, non-fixed statuses,
partial/zero/v4 CVSS, or other constructed edge cases. Those belong in separately labelled test inputs;
do not describe mutations of these reports as upstream captures.

## Attribution

The upstream fixture material is distributed under the Apache License, Version 2.0, not the
repository's default MIT license. Upstream NOTICE is reproduced below (trailing whitespace removed):

```text
Trivy
Copyright 2019-2020 Aqua Security Software Ltd.

This product includes software developed by Aqua Security (https://aquasec.com).
```

The source records' advisory data-source attribution and references are preserved in full.
The upstream LICENSE is reproduced below.

```text
                                 Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.

      "License" shall mean the terms and conditions for use, reproduction,
      and distribution as defined by Sections 1 through 9 of this document.

      "Licensor" shall mean the copyright owner or entity authorized by
      the copyright owner that is granting the License.

      "Legal Entity" shall mean the union of the acting entity and all
      other entities that control, are controlled by, or are under common
      control with that entity. For the purposes of this definition,
      "control" means (i) the power, direct or indirect, to cause the
      direction or management of such entity, whether by contract or
      otherwise, or (ii) ownership of fifty percent (50%) or more of the
      outstanding shares, or (iii) beneficial ownership of such entity.

      "You" (or "Your") shall mean an individual or Legal Entity
      exercising permissions granted by this License.

      "Source" form shall mean the preferred form for making modifications,
      including but not limited to software source code, documentation
      source, and configuration files.

      "Object" form shall mean any form resulting from mechanical
      transformation or translation of a Source form, including but
      not limited to compiled object code, generated documentation,
      and conversions to other media types.

      "Work" shall mean the work of authorship, whether in Source or
      Object form, made available under the License, as indicated by a
      copyright notice that is included in or attached to the work
      (an example is provided in the Appendix below).

      "Derivative Works" shall mean any work, whether in Source or Object
      form, that is based on (or derived from) the Work and for which the
      editorial revisions, annotations, elaborations, or other modifications
      represent, as a whole, an original work of authorship. For the purposes
      of this License, Derivative Works shall not include works that remain
      separable from, or merely link (or bind by name) to the interfaces of,
      the Work and Derivative Works thereof.

      "Contribution" shall mean any work of authorship, including
      the original version of the Work and any modifications or additions
      to that Work or Derivative Works thereof, that is intentionally
      submitted to Licensor for inclusion in the Work by the copyright owner
      or by an individual or Legal Entity authorized to submit on behalf of
      the copyright owner. For the purposes of this definition, "submitted"
      means any form of electronic, verbal, or written communication sent
      to the Licensor or its representatives, including but not limited to
      communication on electronic mailing lists, source code control systems,
      and issue tracking systems that are managed by, or on behalf of, the
      Licensor for the purpose of discussing and improving the Work, but
      excluding communication that is conspicuously marked or otherwise
      designated in writing by the copyright owner as "Not a Contribution."

      "Contributor" shall mean Licensor and any individual or Legal Entity
      on behalf of whom a Contribution has been received by Licensor and
      subsequently incorporated within the Work.

   2. Grant of Copyright License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      copyright license to reproduce, prepare Derivative Works of,
      publicly display, publicly perform, sublicense, and distribute the
      Work and such Derivative Works in Source or Object form.

   3. Grant of Patent License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      (except as stated in this section) patent license to make, have made,
      use, offer to sell, sell, import, and otherwise transfer the Work,
      where such license applies only to those patent claims licensable
      by such Contributor that are necessarily infringed by their
      Contribution(s) alone or by combination of their Contribution(s)
      with the Work to which such Contribution(s) was submitted. If You
      institute patent litigation against any entity (including a
      cross-claim or counterclaim in a lawsuit) alleging that the Work
      or a Contribution incorporated within the Work constitutes direct
      or contributory patent infringement, then any patent licenses
      granted to You under this License for that Work shall terminate
      as of the date such litigation is filed.

   4. Redistribution. You may reproduce and distribute copies of the
      Work or Derivative Works thereof in any medium, with or without
      modifications, and in Source or Object form, provided that You
      meet the following conditions:

      (a) You must give any other recipients of the Work or
          Derivative Works a copy of this License; and

      (b) You must cause any modified files to carry prominent notices
          stating that You changed the files; and

      (c) You must retain, in the Source form of any Derivative Works
          that You distribute, all copyright, patent, trademark, and
          attribution notices from the Source form of the Work,
          excluding those notices that do not pertain to any part of
          the Derivative Works; and

      (d) If the Work includes a "NOTICE" text file as part of its
          distribution, then any Derivative Works that You distribute must
          include a readable copy of the attribution notices contained
          within such NOTICE file, excluding those notices that do not
          pertain to any part of the Derivative Works, in at least one
          of the following places: within a NOTICE text file distributed
          as part of the Derivative Works; within the Source form or
          documentation, if provided along with the Derivative Works; or,
          within a display generated by the Derivative Works, if and
          wherever such third-party notices normally appear. The contents
          of the NOTICE file are for informational purposes only and
          do not modify the License. You may add Your own attribution
          notices within Derivative Works that You distribute, alongside
          or as an addendum to the NOTICE text from the Work, provided
          that such additional attribution notices cannot be construed
          as modifying the License.

      You may add Your own copyright statement to Your modifications and
      may provide additional or different license terms and conditions
      for use, reproduction, or distribution of Your modifications, or
      for any such Derivative Works as a whole, provided Your use,
      reproduction, and distribution of the Work otherwise complies with
      the conditions stated in this License.

   5. Submission of Contributions. Unless You explicitly state otherwise,
      any Contribution intentionally submitted for inclusion in the Work
      by You to the Licensor shall be under the terms and conditions of
      this License, without any additional terms or conditions.
      Notwithstanding the above, nothing herein shall supersede or modify
      the terms of any separate license agreement you may have executed
      with Licensor regarding such Contributions.

   6. Trademarks. This License does not grant permission to use the trade
      names, trademarks, service marks, or product names of the Licensor,
      except as required for reasonable and customary use in describing the
      origin of the Work and reproducing the content of the NOTICE file.

   7. Disclaimer of Warranty. Unless required by applicable law or
      agreed to in writing, Licensor provides the Work (and each
      Contributor provides its Contributions) on an "AS IS" BASIS,
      WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
      implied, including, without limitation, any warranties or conditions
      of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
      PARTICULAR PURPOSE. You are solely responsible for determining the
      appropriateness of using or redistributing the Work and assume any
      risks associated with Your exercise of permissions under this License.

   8. Limitation of Liability. In no event and under no legal theory,
      whether in tort (including negligence), contract, or otherwise,
      unless required by applicable law (such as deliberate and grossly
      negligent acts) or agreed to in writing, shall any Contributor be
      liable to You for damages, including any direct, indirect, special,
      incidental, or consequential damages of any character arising as a
      result of this License or out of the use or inability to use the
      Work (including but not limited to damages for loss of goodwill,
      work stoppage, computer failure or malfunction, or any and all
      other commercial damages or losses), even if such Contributor
      has been advised of the possibility of such damages.

   9. Accepting Warranty or Additional Liability. While redistributing
      the Work or Derivative Works thereof, You may choose to offer,
      and charge a fee for, acceptance of support, warranty, indemnity,
      or other liability obligations and/or rights consistent with this
      License. However, in accepting such obligations, You may act only
      on Your own behalf and on Your sole responsibility, not on behalf
      of any other Contributor, and only if You agree to indemnify,
      defend, and hold each Contributor harmless for any liability
      incurred by, or claims asserted against, such Contributor by reason
      of your accepting any such warranty or additional liability.

   END OF TERMS AND CONDITIONS

   APPENDIX: How to apply the Apache License to your work.

      To apply the Apache License to your work, attach the following
      boilerplate notice, with the fields enclosed by brackets "[]"
      replaced with your own identifying information. (Don't include
      the brackets!)  The text should be enclosed in the appropriate
      comment syntax for the file format. We also recommend that a
      file or class name and description of purpose be included on the
      same "printed page" as the copyright notice for easier
      identification within third-party archives.

   Copyright [yyyy] [name of copyright owner]

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
```
