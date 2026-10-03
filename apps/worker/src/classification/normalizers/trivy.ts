import { assetIdentifierSchema } from "@exposurenexus/backend/assets";
import { weaknessSchema } from "@exposurenexus/backend/findings";
import { AffectedResourceType } from "@exposurenexus/contracts/model/affected-resource";
import { AssetIdentifierType } from "@exposurenexus/contracts/model/asset-identifier";
import { VulnerabilitySeverity } from "@exposurenexus/contracts/model/vulnerability";
import { PackageURL } from "packageurl-js";

import {
  isJsonObject,
  isNonBlankString,
  readArray,
  readCweIdentifier,
  readDateTime,
  readObject,
  readSourceLocation,
  readText,
  renderEvidenceSection,
} from "./shared.js";

import type { Normalizer, ObservationCandidate } from "../classifier.js";
import type { Diagnostics, JsonObject } from "./shared.js";
import type { CvssAssessment } from "@exposurenexus/contracts/model/weakness";
import type { Logger } from "pino";

const severities = new Map<string, VulnerabilitySeverity>([
  ["CRITICAL", VulnerabilitySeverity.Critical],
  ["HIGH", VulnerabilitySeverity.High],
  ["MEDIUM", VulnerabilitySeverity.Medium],
  ["LOW", VulnerabilitySeverity.Low],
  ["INFO", VulnerabilitySeverity.Info],
  // Trivy's documented rating for advisories without a vendor severity yet.
  ["UNKNOWN", VulnerabilitySeverity.Info],
]);
const excludedDetectionCollections = [
  "Secrets",
  "Licenses",
  "CustomResources",
  "ExperimentalModifiedFindings",
] as const;
const resultCollections = new Set([
  "Vulnerabilities",
  "Misconfigurations",
  ...excludedDetectionCollections,
  "Packages",
  "CryptoAssets",
]);

// Mirrors Trivy's own result-type to PURL-type mapping (pkg/purl), so records without a PURL get
// the ecosystem their PURL would carry; unknown analyzer/distro names are not ecosystem guesses.
const ecosystems = new Map(
  (
    [
      ["maven", ["jar", "pom", "gradle", "sbt"]],
      ["gem", ["bundler", "gemspec"]],
      ["nuget", ["nuget", "dotnet-core", "packages-props"]],
      ["composer", ["composer", "composer-vendor"]],
      ["conda", ["conda-pkg", "conda-environment"]],
      ["pypi", ["python-pkg", "pip", "pipenv", "poetry", "uv", "pylock"]],
      ["golang", ["gobinary", "gomod"]],
      ["npm", ["npm", "node-pkg", "yarn", "pnpm", "bun"]],
      ["cocoapods", ["cocoapods"]],
      ["swift", ["swift"]],
      ["hex", ["hex"]],
      ["conan", ["conan"]],
      ["pub", ["pub"]],
      ["cargo", ["cargo", "rustbinary"]],
      ["julia", ["julia"]],
      ["bitnami", ["bitnami"]],
      ["bottlerocket", ["bottlerocket"]],
      ["apk", ["alpine", "chainguard", "wolfi", "minimos"]],
      ["deb", ["debian", "ubuntu", "echo"]],
      [
        "rpm",
        [
          "redhat",
          "centos",
          "centos-stream",
          "rocky",
          "alma",
          "amazon",
          "fedora",
          "oracle",
          "opensuse",
          "opensuse-leap",
          "opensuse-tumbleweed",
          "sles",
          "slem",
          "photon",
          "azurelinux",
          "cbl-mariner",
          "coreos",
        ],
      ],
    ] as const
  ).flatMap(([ecosystem, types]) => types.map((type): [string, string] => [type, ecosystem])),
);

/** One candidate per ordinary package vulnerability or failed IaC detection. */
export class TrivyNormalizer implements Normalizer {
  public async normalize(bytes: Uint8Array, logger: Logger): Promise<ObservationCandidate[]> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    } catch {
      throw new Error("trivy: invalid JSON or UTF-8");
    }
    if (!isJsonObject(parsed)) {
      throw new Error("trivy: document must be a JSON object");
    }
    if (
      parsed.SchemaVersion !== 2 ||
      typeof parsed.ArtifactName !== "string" ||
      typeof parsed.ArtifactType !== "string"
    ) {
      throw new Error("trivy: expected a native schema-2 report envelope");
    }
    if (parsed.Results !== undefined && !Array.isArray(parsed.Results)) {
      throw new Error("trivy: /Results must be an array");
    }
    const warnDocument: Diagnostics = (field) => {
      logger.warn({ field }, "trivy: ignoring unusable optional value");
    };
    let observedAt: Date | null = null;
    if (parsed.CreatedAt !== undefined) {
      observedAt = readDateTime(parsed.CreatedAt);
      if (observedAt === null) warnDocument("CreatedAt");
    }
    const assets = readAssets(parsed.Metadata, warnDocument);
    const document = Object.fromEntries(
      Object.entries(parsed).filter(([key]) => key !== "Results"),
    );
    const candidates: ObservationCandidate[] = [];
    for (const [r, scanResult] of (parsed.Results ?? []).entries()) {
      const resultLocator = `/Results/${r}`;
      if (!isJsonObject(scanResult)) {
        throw new Error(`trivy: ${resultLocator} must be an object`);
      }
      for (const field of excludedDetectionCollections) {
        const records = readArray(scanResult[field], field, (field) => {
          logger.warn(
            { sourceRecord: resultLocator, field },
            "trivy: ignoring unusable optional value",
          );
        });
        if (records.length > 0) {
          logger.warn(
            { sourceRecord: resultLocator, field, count: records.length },
            "trivy: skipping excluded detection records",
          );
        }
      }
      const context = Object.fromEntries(
        Object.entries(scanResult).filter(([key]) => !resultCollections.has(key)),
      );
      let target: string | undefined;
      for (const collection of ["Vulnerabilities", "Misconfigurations"] as const) {
        const records = scanResult[collection];
        if (records === undefined) continue;
        if (!Array.isArray(records)) {
          throw new Error(`trivy: ${resultLocator}/${collection} must be an array`);
        }
        const isPackage = collection === "Vulnerabilities";
        for (const [index, result] of records.entries()) {
          const sourceRecord = `${resultLocator}/${collection}/${index}`;
          if (!isJsonObject(result)) {
            throw new Error(`trivy: ${sourceRecord} must be an object`);
          }
          if (!isPackage) {
            if (result.Status === "PASS" || result.Status === "EXCEPTION") continue;
            if (result.Status !== "FAIL") {
              throw new Error(`trivy: ${sourceRecord}/Status must be FAIL, PASS, or EXCEPTION`);
            }
          }
          const idField = isPackage ? "VulnerabilityID" : "ID";
          const id = result[idField];
          if (!isNonBlankString(id)) {
            throw new Error(`trivy: ${sourceRecord}/${idField} must be a nonblank string`);
          }
          // Target is validated once per result, and only once it reports a failed detection.
          const file = isPackage ? undefined : (target ??= readTarget(scanResult, resultLocator));
          if (isPackage && !isNonBlankString(result.PkgName)) {
            throw new Error(`trivy: ${sourceRecord}/PkgName must be a nonblank string`);
          }
          const warn: Diagnostics = (field) => {
            logger.warn({ sourceRecord, field }, "trivy: ignoring unusable optional value");
          };
          const severity =
            typeof result.Severity === "string" ? severities.get(result.Severity) : undefined;
          if (severity === undefined) warn("Severity");
          const identifiers: Record<string, string[]> = { trivy: [id] };
          const aliasField = isPackage ? "VendorIDs" : "AVDID";
          const aliases = isPackage
            ? readArray(result.VendorIDs, aliasField, warn)
            : [result.AVDID];
          for (const value of aliases) {
            const alias = readText(value, aliasField, warn);
            if (alias !== null) identifiers.trivy.push(alias);
          }
          for (const nativeId of identifiers.trivy) {
            const namespace = /^(cve|ghsa)-/iu.exec(nativeId.trim())?.[1].toLowerCase();
            if (namespace === undefined) continue;
            const standard = weaknessSchema.safeParse({ identifiers: { [namespace]: [nativeId] } });
            if (standard.success) {
              (identifiers[namespace] ??= []).push(...standard.data.identifiers[namespace]);
            } else {
              warn(nativeId === id ? idField : aliasField);
            }
          }
          for (const value of readArray(result.CweIDs, "CweIDs", warn)) {
            const cwe = readCweIdentifier(value, "CweIDs", warn);
            if (cwe !== undefined) (identifiers.cwe ??= []).push(cwe);
          }
          const references: string[] = [];
          const primary = readText(result.PrimaryURL, "PrimaryURL", warn);
          if (primary !== null) references.push(primary);
          for (const value of readArray(result.References, "References", warn)) {
            const reference = readText(value, "References", warn);
            if (reference !== null) references.push(reference);
          }
          const cvss = isPackage ? readCvss(result.CVSS, warn) : [];
          candidates.push({
            source: "trivy",
            sourceRecord,
            title: readText(result.Title, "Title", warn) ?? id,
            description: readText(result.Description, "Description", warn),
            severity: severity ?? VulnerabilitySeverity.Info,
            weakness: {
              identifiers,
              ...(references.length === 0 ? {} : { references: [...new Set(references)] }),
              ...(cvss.length === 0 ? {} : { cvss }),
            },
            ...(file === undefined
              ? readPackage(result, scanResult.Type, warn)
              : readMisconfiguration(result, file, warn)),
            assetIdentifierCandidates: structuredClone(assets),
            observedAt: observedAt === null ? null : new Date(observedAt),
            sourceMetadata: {
              provenance: structuredClone({ document, scanResult: context, result }),
            },
          });
        }
      }
    }
    return candidates;
  }
}

function readTarget(scanResult: JsonObject, resultLocator: string): string {
  if (!isNonBlankString(scanResult.Target)) {
    throw new Error(`trivy: ${resultLocator}/Target must be a nonblank string`);
  }
  return scanResult.Target;
}

function readMisconfiguration(
  result: JsonObject,
  target: string,
  warn: Diagnostics,
): Pick<ObservationCandidate, "affectedResource" | "evidence" | "remediation"> {
  const cause = readObject(result.CauseMetadata, "CauseMetadata", warn);
  const location = readLocation(cause, "CauseMetadata", warn);
  const symbol = readText(cause.Resource, "CauseMetadata.Resource", warn);
  const evidence: string[] = [];
  const message = readText(result.Message, "Message", warn);
  if (message !== null) evidence.push(renderEvidenceSection("Message", message));
  const code = readObject(cause.Code, "CauseMetadata.Code", warn);
  const lines: string[] = [];
  for (const line of readArray(code.Lines, "CauseMetadata.Code.Lines", warn)) {
    if (!isJsonObject(line)) {
      warn("CauseMetadata.Code.Lines");
    } else if (typeof line.Content === "string") {
      // Empty lines are source text too; do not reconstruct omitted/truncated context.
      lines.push(line.Content);
    } else {
      warn("CauseMetadata.Code.Lines.Content");
    }
  }
  if (lines.length > 0) {
    evidence.push(renderEvidenceSection("Code (reported excerpt)", lines.join("\n")));
  }
  for (const occurrence of readArray(cause.Occurrences, "CauseMetadata.Occurrences", warn)) {
    if (!isJsonObject(occurrence)) {
      warn("CauseMetadata.Occurrences");
      continue;
    }
    const resource = readText(occurrence.Resource, "CauseMetadata.Occurrences.Resource", warn);
    const file = readText(occurrence.Filename, "CauseMetadata.Occurrences.Filename", warn);
    const range = readLocation(
      readObject(occurrence.Location, "CauseMetadata.Occurrences.Location", warn),
      "CauseMetadata.Occurrences.Location",
      warn,
    );
    const details = [
      ...(resource === null ? [] : [`Resource: ${resource}`]),
      ...(file === null ? [] : [`File: ${file}`]),
      ...(range === undefined
        ? []
        : [
            `Lines: ${range.startLine}${range.endLine === undefined || range.endLine === range.startLine ? "" : `-${range.endLine}`}`,
          ]),
    ];
    if (details.length > 0)
      evidence.push(renderEvidenceSection("Additional occurrence", details.join("\n")));
  }
  return {
    affectedResource: {
      type: AffectedResourceType.SourceCode,
      file: target,
      ...(location === undefined ? {} : { location }),
      ...(symbol === null ? {} : { symbol }),
    },
    evidence: evidence.length === 0 ? null : evidence.join("\n\n"),
    remediation: readText(result.Resolution, "Resolution", warn),
  };
}

function readPackage(
  result: JsonObject,
  type: unknown,
  warn: Diagnostics,
): Pick<ObservationCandidate, "affectedResource" | "evidence" | "remediation"> {
  const name = result.PkgName as string;
  const version = readText(result.InstalledVersion, "InstalledVersion", warn);
  const installationPath = readText(result.PkgPath, "PkgPath", warn);
  const status = readText(result.Status, "Status", warn);
  const fixed = readText(result.FixedVersion, "FixedVersion", warn);
  const identifier = readObject(result.PkgIdentifier, "PkgIdentifier", warn);
  const purl = readText(identifier.PURL, "PkgIdentifier.PURL", warn);
  let ecosystem = typeof type === "string" ? ecosystems.get(type) : undefined;
  if (purl !== null) {
    try {
      ecosystem = PackageURL.fromString(purl).type;
    } catch {
      warn("PkgIdentifier.PURL");
    }
  }
  return {
    affectedResource: {
      type: AffectedResourceType.Package,
      name,
      ...(version === null ? {} : { version }),
      ...(installationPath === null ? {} : { installationPath }),
      ...(ecosystem === undefined ? {} : { ecosystem }),
    },
    evidence: [
      renderEvidenceSection("Package", name),
      ...(version === null ? [] : [renderEvidenceSection("Installed version", version)]),
      ...(status === null ? [] : [renderEvidenceSection("Advisory status", status)]),
    ].join("\n\n"),
    remediation: fixed === null ? null : renderEvidenceSection("Reported fixed version(s)", fixed),
  };
}

function readCvss(value: unknown, warn: Diagnostics): CvssAssessment[] {
  const assessments: CvssAssessment[] = [];
  const seen = new Set<string>();
  // Vendor keys are arbitrary source text: never include them in diagnostics.
  for (const raw of Object.values(readObject(value, "CVSS", warn))) {
    const vendor = readObject(raw, "CVSS", warn);
    for (const slot of ["V2", "V3", "V40"] as const) {
      const rawScore = vendor[`${slot}Score`];
      let score: number | undefined;
      if (
        typeof rawScore === "number" &&
        Number.isFinite(rawScore) &&
        rawScore >= 0 &&
        rawScore <= 10
      ) {
        score = rawScore;
      } else if (rawScore !== undefined) {
        warn(`CVSS.${slot}Score`);
      }
      const vector = readText(vendor[`${slot}Vector`], `CVSS.${slot}Vector`, warn);
      if (score === undefined && vector === null) continue;
      const version =
        slot === "V2"
          ? "2.0"
          : slot === "V40"
            ? "4.0"
            : /^CVSS:(3\.[01])\//u.exec(vector ?? "")?.[1];
      const assessment: CvssAssessment = {
        ...(score === undefined ? {} : { score }),
        ...(vector === null ? {} : { vector }),
        ...(version === undefined ? {} : { version }),
      };
      const key = JSON.stringify(assessment);
      if (!seen.has(key)) {
        seen.add(key);
        assessments.push(assessment);
      }
    }
  }
  return assessments;
}

function readLocation(value: JsonObject, field: string, warn: Diagnostics) {
  return readSourceLocation(
    {
      startLine: { value: value.StartLine, field: `${field}.StartLine` },
      endLine: { value: value.EndLine, field: `${field}.EndLine` },
      startColumn: { value: undefined, field: `${field}.StartColumn` },
      endColumn: { value: undefined, field: `${field}.EndColumn` },
    },
    warn,
  );
}

function readAssets(
  value: unknown,
  warn: Diagnostics,
): ObservationCandidate["assetIdentifierCandidates"] {
  const metadata = readObject(value, "Metadata", warn);
  const assets: ObservationCandidate["assetIdentifierCandidates"] = [];
  for (const field of ["RepoURL", "Reference", "RepoTags", "RepoDigests"] as const) {
    const values =
      field === "RepoTags" || field === "RepoDigests"
        ? readArray(metadata[field], `Metadata.${field}`, warn)
        : [metadata[field]];
    for (const raw of values) {
      let reference = readText(raw, `Metadata.${field}`, warn);
      if (reference === null) continue;
      const type =
        field === "RepoURL" ? AssetIdentifierType.VcsRepository : AssetIdentifierType.OciImageName;
      if (type === AssetIdentifierType.OciImageName) {
        // Metadata references are explicit identities, unlike ArtifactName (which may be an archive).
        // Validate qualifiers before removing them so malformed references cannot become valid names.
        if (/^sha\d+:/iu.test(reference) || /^[a-f\d]{64}$/iu.test(reference)) {
          warn(`Metadata.${field}`);
          continue;
        }
        const [name, digest, ...extra] = reference.split("@");
        if (
          extra.length > 0 ||
          (digest !== undefined &&
            !/^(?:sha256:[a-f\d]{64}|sha384:[a-f\d]{96}|sha512:[a-f\d]{128})$/u.test(digest)) ||
          (field === "RepoDigests" && digest === undefined)
        ) {
          warn(`Metadata.${field}`);
          continue;
        }
        reference = name;
        const colon = reference.lastIndexOf(":");
        if (colon > reference.lastIndexOf("/")) {
          if (!/^[\w][\w.-]{0,127}$/u.test(reference.slice(colon + 1))) {
            warn(`Metadata.${field}`);
            continue;
          }
          reference = reference.slice(0, colon);
        }
      }
      const identifier = assetIdentifierSchema.safeParse({ type, value: reference });
      if (!identifier.success) {
        warn(`Metadata.${field}`);
      } else if (
        !assets.some((asset) => asset.type === type && asset.value === identifier.data.value)
      ) {
        assets.push(identifier.data);
      }
    }
  }
  return assets;
}
