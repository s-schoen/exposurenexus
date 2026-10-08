import { ScannerSource } from "@exposurenexus/contracts/model/observation";
import { pino } from "pino";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Classifier } from "../classifier.js";
import { BearerJsonNormalizer } from "./bearer.js";
import { CheckovNormalizer } from "./checkov.js";
import { KicsNormalizer } from "./kics.js";
import { NucleiNormalizer } from "./nuclei.js";
import { createScannerClassifier, scannerNormalizers } from "./registry.js";
import { SemgrepJsonNormalizer } from "./semgrep.js";
import { TrivyNormalizer } from "./trivy.js";
import { ZapSarifNormalizer } from "./zap.js";

describe("scanner normalizer registry", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("has exactly one normalizer for every scanner source", () => {
    expect(Object.keys(scannerNormalizers).sort()).toEqual(Object.values(ScannerSource).sort());
    expect(new Set(Object.values(scannerNormalizers)).size).toBe(
      Object.values(ScannerSource).length,
    );
  });

  it.each([
    [ScannerSource.Nuclei, NucleiNormalizer],
    [ScannerSource.Zap, ZapSarifNormalizer],
    [ScannerSource.Semgrep, SemgrepJsonNormalizer],
    [ScannerSource.Bearer, BearerJsonNormalizer],
    [ScannerSource.Checkov, CheckovNormalizer],
    [ScannerSource.Kics, KicsNormalizer],
    [ScannerSource.Trivy, TrivyNormalizer],
  ])("registers the %s normalizer", (source, normalizer) => {
    expect(scannerNormalizers[source]).toBeInstanceOf(normalizer);
  });

  it("registers each normalizer once under its scanner source key", () => {
    const register = vi.spyOn(Classifier.prototype, "registerNormalizer");

    expect(createScannerClassifier(pino({ enabled: false }))).toBeInstanceOf(Classifier);

    expect(register.mock.calls).toHaveLength(Object.values(ScannerSource).length);
    for (const source of Object.values(ScannerSource)) {
      expect(register).toHaveBeenCalledWith(source, scannerNormalizers[source]);
    }
  });
});
