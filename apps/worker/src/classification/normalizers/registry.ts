import { ScannerSource } from "@exposurenexus/contracts/model/observation";

import { Classifier } from "../classifier.js";
import { BearerJsonNormalizer } from "./bearer.js";
import { CheckovNormalizer } from "./checkov.js";
import { KicsNormalizer } from "./kics.js";
import { NucleiNormalizer } from "./nuclei.js";
import { SemgrepJsonNormalizer } from "./semgrep.js";
import { TrivyNormalizer } from "./trivy.js";
import { ZapSarifNormalizer } from "./zap.js";

import type { Normalizer } from "../classifier.js";
import type { Logger } from "pino";

/** The production normalizer for every scanner source an import may declare. */
export const scannerNormalizers: Readonly<Record<ScannerSource, Normalizer>> = {
  [ScannerSource.Nuclei]: new NucleiNormalizer(),
  [ScannerSource.Zap]: new ZapSarifNormalizer(),
  [ScannerSource.Semgrep]: new SemgrepJsonNormalizer(),
  [ScannerSource.Bearer]: new BearerJsonNormalizer(),
  [ScannerSource.Checkov]: new CheckovNormalizer(),
  [ScannerSource.Kics]: new KicsNormalizer(),
  [ScannerSource.Trivy]: new TrivyNormalizer(),
};

/** Creates a classifier with every scanner normalizer registered under its source key. */
export function createScannerClassifier(logger: Logger): Classifier {
  const classifier = new Classifier(logger);
  for (const source of Object.values(ScannerSource)) {
    classifier.registerNormalizer(source, scannerNormalizers[source]);
  }
  return classifier;
}
