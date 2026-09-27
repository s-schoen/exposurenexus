import { AffectedResourceType } from "@exposurenexus/contracts/model/affected-resource";
import { AssetIdentifierType } from "@exposurenexus/contracts/model/asset-identifier";
import { VulnerabilitySeverity } from "@exposurenexus/contracts/model/vulnerability";
import { describe, expect, it, vi } from "vitest";

import { Classifier } from "./classifier.js";

import type { Normalizer, ObservationCandidate } from "./classifier.js";
import type { Logger } from "pino";

const scanData = new TextEncoder().encode('{"findings":[]}');

function createLogger() {
  return { debug: vi.fn(), warn: vi.fn() };
}

function createNormalizer() {
  const normalize = vi.fn(
    async (_scanData: Uint8Array, _logger: Logger) => [] as ObservationCandidate[],
  );
  const normalizer: Normalizer = { normalize };
  return { normalizer, normalize };
}

function createClassifier() {
  const logger = createLogger();
  const classifier = new Classifier(logger as unknown as Logger);
  return { classifier, logger };
}

function candidate(overrides: Partial<ObservationCandidate> = {}): ObservationCandidate {
  return {
    source: "nuclei",
    sourceRecord: "record-1",
    title: "Example finding",
    description: "A description",
    remediation: "Apply the patch",
    evidence: "GET /login",
    severity: VulnerabilitySeverity.High,
    weakness: { identifiers: { cwe: ["CWE-89"] } },
    affectedResource: { type: AffectedResourceType.WebEndpoint, host: "example.com" },
    observedAt: new Date("2026-01-02T03:04:05.000Z"),
    assetIdentifierCandidates: [
      { type: AssetIdentifierType.DnsName, namespace: null, value: "example.com" },
    ],
    ...overrides,
  };
}

describe("Classifier", () => {
  it("dispatches to the normalizer registered for the source", async () => {
    const { classifier, logger } = createClassifier();
    const nuclei = createNormalizer();
    const checkov = createNormalizer();
    classifier.registerNormalizer("nuclei", nuclei.normalizer);
    classifier.registerNormalizer("checkov", checkov.normalizer);
    nuclei.normalize.mockResolvedValue([candidate()]);

    const result = await classifier.normalize("nuclei", scanData);

    expect(result).toHaveLength(1);
    expect(nuclei.normalize).toHaveBeenCalledExactlyOnceWith(scanData, logger);
    expect(checkov.normalize).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledOnce();
  });

  it("rejects duplicate registration and keeps the original normalizer", async () => {
    const { classifier } = createClassifier();
    const first = createNormalizer();
    const second = createNormalizer();
    classifier.registerNormalizer("nuclei", first.normalizer);

    expect(() => classifier.registerNormalizer("nuclei", second.normalizer)).toThrow(
      /duplicate normalizer for source nuclei/,
    );

    first.normalize.mockResolvedValue([candidate()]);
    await classifier.normalize("nuclei", scanData);
    expect(first.normalize).toHaveBeenCalledOnce();
    expect(second.normalize).not.toHaveBeenCalled();
  });

  it("rejects an unregistered source without calling any normalizer", async () => {
    const { classifier } = createClassifier();
    const nuclei = createNormalizer();
    classifier.registerNormalizer("nuclei", nuclei.normalizer);

    await expect(classifier.normalize("checkov", scanData)).rejects.toThrow(
      "no normalizer available for source checkov",
    );
    expect(nuclei.normalize).not.toHaveBeenCalled();
  });

  it("canonicalizes weakness and asset identifiers from a normalizer", async () => {
    const { classifier } = createClassifier();
    const { normalizer, normalize } = createNormalizer();
    classifier.registerNormalizer("nuclei", normalizer);
    normalize.mockResolvedValue([
      candidate({
        weakness: { identifiers: { CWE: [" cwe-89 "] } },
        assetIdentifierCandidates: [
          { type: AssetIdentifierType.DnsName, namespace: null, value: "Example.COM." },
        ],
      }),
    ]);

    const [result] = await classifier.normalize("nuclei", scanData);

    expect(result?.weakness).toEqual({ identifiers: { cwe: ["CWE-89"] } });
    expect(result?.assetIdentifierCandidates).toEqual([
      { type: AssetIdentifierType.DnsName, namespace: null, value: "example.com" },
    ]);
  });

  it("stamps the registry source and preserves the remaining candidate fields", async () => {
    const { classifier } = createClassifier();
    const { normalizer, normalize } = createNormalizer();
    classifier.registerNormalizer("nuclei", normalizer);
    const input = candidate({ source: "checkov" });
    normalize.mockResolvedValue([input]);

    const [result] = await classifier.normalize("nuclei", scanData);

    expect(result).toEqual({ ...input, source: "nuclei" });
  });

  it.each([
    {
      name: "an invalid weakness",
      overrides: { weakness: { identifiers: { "not valid": ["x"] } } },
    },
    {
      name: "an invalid asset identifier",
      overrides: {
        assetIdentifierCandidates: [
          { type: AssetIdentifierType.DnsName, namespace: null, value: "https://example.com" },
        ],
      },
    },
    {
      name: "both invalid",
      overrides: {
        weakness: { identifiers: { "not valid": ["x"] } },
        assetIdentifierCandidates: [
          { type: AssetIdentifierType.DnsName, namespace: null, value: "https://example.com" },
        ],
      },
    },
  ])("skips a candidate with $name and warns once", async ({ overrides }) => {
    const { classifier, logger } = createClassifier();
    const { normalizer, normalize } = createNormalizer();
    classifier.registerNormalizer("nuclei", normalizer);
    normalize.mockResolvedValue([candidate(overrides as Partial<ObservationCandidate>)]);

    const result = await classifier.normalize("nuclei", scanData);

    expect(result).toEqual([]);
    expect(logger.warn).toHaveBeenCalledExactlyOnceWith({ source: "nuclei" }, expect.any(String));
  });

  it("skips the whole asset identifier array when one element is invalid", async () => {
    const { classifier, logger } = createClassifier();
    const { normalizer, normalize } = createNormalizer();
    classifier.registerNormalizer("nuclei", normalizer);
    normalize.mockResolvedValue([
      candidate({
        assetIdentifierCandidates: [
          { type: AssetIdentifierType.DnsName, namespace: null, value: "example.com" },
          { type: AssetIdentifierType.DnsName, namespace: null, value: "https://example.com" },
        ],
      }),
    ]);

    const result = await classifier.normalize("nuclei", scanData);

    expect(result).toEqual([]);
    expect(logger.warn).toHaveBeenCalledOnce();
  });

  it("preserves candidate order and duplicates", async () => {
    const { classifier } = createClassifier();
    const { normalizer, normalize } = createNormalizer();
    classifier.registerNormalizer("nuclei", normalizer);
    normalize.mockResolvedValue([
      candidate({ sourceRecord: "record-1", title: "A" }),
      candidate({ sourceRecord: "record-1", title: "B" }),
      candidate({ sourceRecord: "record-1", title: "A" }),
      candidate({ sourceRecord: "record-2", title: "C" }),
    ]);

    const result = await classifier.normalize("nuclei", scanData);

    expect(result.map((entry) => `${entry.sourceRecord}:${entry.title}`)).toEqual([
      "record-1:A",
      "record-1:B",
      "record-1:A",
      "record-2:C",
    ]);
  });

  it("returns an empty list without warning when the source reports nothing", async () => {
    const { classifier, logger } = createClassifier();
    const { normalizer, normalize } = createNormalizer();
    classifier.registerNormalizer("nuclei", normalizer);
    normalize.mockResolvedValue([]);

    const result = await classifier.normalize("nuclei", scanData);

    expect(result).toEqual([]);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("accepts empty identifier collections", async () => {
    const { classifier, logger } = createClassifier();
    const { normalizer, normalize } = createNormalizer();
    classifier.registerNormalizer("nuclei", normalizer);
    const input = candidate({ weakness: { identifiers: {} }, assetIdentifierCandidates: [] });
    normalize.mockResolvedValue([input]);

    const result = await classifier.normalize("nuclei", scanData);

    expect(result).toEqual([{ ...input, source: "nuclei" }]);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("propagates parser failures unchanged", async () => {
    const { classifier } = createClassifier();
    const { normalizer, normalize } = createNormalizer();
    classifier.registerNormalizer("nuclei", normalizer);
    const failure = new Error("scan-data-malformed");
    normalize.mockRejectedValue(failure);

    await expect(classifier.normalize("nuclei", scanData)).rejects.toBe(failure);
  });

  it("does not mutate the parser result", async () => {
    const { classifier } = createClassifier();
    const { normalizer, normalize } = createNormalizer();
    classifier.registerNormalizer("nuclei", normalizer);
    const input = candidate({
      weakness: { identifiers: { CWE: [" cwe-89 "] } },
      assetIdentifierCandidates: [
        { type: AssetIdentifierType.DnsName, namespace: null, value: "Example.COM." },
      ],
    });
    const snapshot = structuredClone(input);
    normalize.mockResolvedValue([input]);

    await classifier.normalize("nuclei", scanData);

    expect(input).toEqual(snapshot);
  });
});
