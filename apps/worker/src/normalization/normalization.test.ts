import { AffectedResourceType } from "@exposurenexus/contracts/model/affected-resource";
import { AssetIdentifierType } from "@exposurenexus/contracts/model/asset-identifier";
import { VulnerabilitySeverity } from "@exposurenexus/contracts/model/vulnerability";
import { pino } from "pino";
import { describe, expect, it, vi } from "vitest";

import { normalize, type Normalizer, type ObservationCandidateInput } from "./normalization.js";

const candidate: ObservationCandidateInput = {
  sourceRecord: "/Report/Host[1]/Finding[2]",
  title: "  Scanner title\n",
  description: "Plain text, not prescribed Markdown.\n",
  remediation: null,
  evidence: "  Scanner evidence\n",
  severity: VulnerabilitySeverity.High,
  weakness: {
    identifiers: {
      CVE: [" cve-2026-12345 ", "CVE-2026-12345"],
      semgrep: ["CaseSensitive.Rule"],
    },
  },
  affectedResource: {
    type: AffectedResourceType.WebEndpoint,
    path: "/admin",
    reportedUrl: "https://EXAMPLE.COM/admin",
  },
  observedAt: new Date("2026-09-19T10:00:00Z"),
  potentialAssetIdentifiers: [{ type: AssetIdentifierType.DnsName, value: "EXAMPLE.COM." }],
};

describe("normalization", () => {
  it.each(["test-scanner", ""])(
    "dispatches the registered source %j and canonicalizes identifiers without rewriting content",
    (source) => {
      const bytes = Uint8Array.of(1, 2, 3);
      const logger = pino({ enabled: false });
      const normalizer = { normalize: vi.fn<Normalizer["normalize"]>(() => [candidate]) };
      const otherNormalizer = { normalize: vi.fn<Normalizer["normalize"]>(() => []) };
      const normalizers = new Map([
        ["other-scanner", otherNormalizer],
        [source, normalizer],
      ]);

      expect(normalize(source, bytes, normalizers, logger)).toEqual([
        {
          ...candidate,
          source,
          weakness: {
            identifiers: { cve: ["CVE-2026-12345"], semgrep: ["CaseSensitive.Rule"] },
          },
          potentialAssetIdentifiers: [
            { type: AssetIdentifierType.DnsName, namespace: null, value: "example.com" },
          ],
        },
      ]);
      expect(normalizer.normalize).toHaveBeenCalledExactlyOnceWith(bytes, logger);
      expect(otherNormalizer.normalize).not.toHaveBeenCalled();
      expect(candidate.potentialAssetIdentifiers[0].value).toBe("EXAMPLE.COM.");
    },
  );

  it("executes a class implementation with its instance as the method receiver", () => {
    class TestNormalizer implements Normalizer {
      private readonly records = [candidate];

      normalize(): ObservationCandidateInput[] {
        return this.records;
      }
    }

    expect(
      normalize(
        "test-scanner",
        new Uint8Array(),
        new Map([["test-scanner", new TestNormalizer()]]),
        pino({ enabled: false }),
      ),
    ).toMatchObject([{ source: "test-scanner", title: candidate.title }]);
  });

  it("preserves order and duplicates while skipping identifiers that cannot be canonicalized", () => {
    const logs: string[] = [];
    const logger = pino({}, { write: (line) => logs.push(line) });
    const secret = "sensitive scanner content";
    const first = { ...candidate, source: "untrusted-source", sourceRecord: "record:first" };
    const proposed: ObservationCandidateInput[] = [
      first,
      {
        ...candidate,
        sourceRecord: secret,
        evidence: secret,
        weakness: { identifiers: { [secret]: [secret] } },
      },
      {
        ...candidate,
        sourceRecord: secret,
        potentialAssetIdentifiers: [{ type: AssetIdentifierType.IpAddress, value: secret }],
      },
      first,
      { ...candidate, sourceRecord: "record:last" },
    ];

    const accepted = normalize(
      "test-scanner",
      new Uint8Array(),
      new Map([["test-scanner", { normalize: () => proposed }]]),
      logger,
    );

    expect(accepted.map(({ sourceRecord }) => sourceRecord)).toEqual([
      "record:first",
      "record:first",
      "record:last",
    ]);
    expect(accepted.every(({ source }) => source === "test-scanner")).toBe(true);
    expect(logs).toHaveLength(2);
    expect(logs.join("")).not.toContain(secret);
  });

  it("accepts nullable content and empty matching information without warnings", () => {
    const logger = pino({ enabled: false });
    const warn = vi.spyOn(logger, "warn");
    const sparse: ObservationCandidateInput = {
      ...candidate,
      description: null,
      evidence: null,
      severity: VulnerabilitySeverity.Info,
      weakness: { identifiers: {} },
      affectedResource: { type: AffectedResourceType.Unspecified },
      observedAt: null,
      potentialAssetIdentifiers: [],
    };

    expect(
      normalize(
        "test-scanner",
        new Uint8Array(),
        new Map([["test-scanner", { normalize: () => [sparse] }]]),
        logger,
      ),
    ).toEqual([{ ...sparse, source: "test-scanner" }]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("trusts parser-produced candidate fields without revalidating them", () => {
    const logger = pino({ enabled: false });
    const warn = vi.spyOn(logger, "warn");
    const normalizer: Normalizer = {
      normalize: () => [{ ...candidate, title: "" }],
    };

    expect(
      normalize("test-scanner", new Uint8Array(), new Map([["test-scanner", normalizer]]), logger),
    ).toMatchObject([{ source: "test-scanner", title: "" }]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("returns an empty array for no detections or entirely unnormalizable identifiers", () => {
    const logger = pino({ enabled: false });
    const warn = vi.spyOn(logger, "warn");
    const normalizer = { normalize: vi.fn<Normalizer["normalize"]>(() => []) };
    const normalizers = new Map([["test-scanner", normalizer]]);

    expect(normalize("test-scanner", new Uint8Array(), normalizers, logger)).toEqual([]);
    expect(warn).not.toHaveBeenCalled();

    normalizer.normalize.mockReturnValueOnce([
      { ...candidate, weakness: { identifiers: { cve: ["not-a-cve"] } } },
    ]);
    expect(normalize("test-scanner", new Uint8Array(), normalizers, logger)).toEqual([]);
    expect(warn).toHaveBeenCalledOnce();
  });

  it.each(["unknown", "TEST-SCANNER", " test-scanner "])(
    "fails for unregistered source %s without attempting a normalizer",
    (source) => {
      const logger = pino({ enabled: false });
      const normalizer = { normalize: vi.fn<Normalizer["normalize"]>(() => [candidate]) };

      expect(() =>
        normalize(source, new Uint8Array(), new Map([["test-scanner", normalizer]]), logger),
      ).toThrow("No normalizer is registered for this source.");
      expect(normalizer.normalize).not.toHaveBeenCalled();
    },
  );

  it("propagates fatal normalizer errors instead of treating them as empty results", () => {
    const logger = pino({ enabled: false });
    const failure = new Error("Unable to read the scanner document.");
    const normalizer: Normalizer = {
      normalize() {
        throw failure;
      },
    };

    expect(() =>
      normalize("test-scanner", new Uint8Array(), new Map([["test-scanner", normalizer]]), logger),
    ).toThrow(failure);
  });
});
