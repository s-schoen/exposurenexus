import { pino } from "pino";
import { describe, expect, it } from "vitest";

import { createFindings, type Findings } from "./features/findings/index.js";
import { createStatistics, type Statistics } from "./features/statistics/index.js";
import { createVulnerabilities, type Vulnerabilities } from "./features/vulnerabilities/index.js";
import { createBackendRuntime } from "./runtime.js";

describe("public feature factories", () => {
  it("exports only runtime factories as feature values", async () => {
    expect(Object.keys(await import("./features/findings/index.js"))).toEqual(["createFindings"]);
    expect(Object.keys(await import("./features/vulnerabilities/index.js"))).toEqual([
      "createVulnerabilities",
    ]);
    expect(Object.keys(await import("./features/statistics/index.js"))).toEqual([
      "createStatistics",
    ]);
  });

  it("memoizes each feature independently per runtime without authentication configuration", () => {
    const options = { database: {} as never, logger: pino({ enabled: false }) };
    const first = createBackendRuntime(options);
    const second = createBackendRuntime(options);
    const findings: Findings = createFindings(first);
    const vulnerabilities: Vulnerabilities = createVulnerabilities(first);
    const statistics: Statistics = createStatistics(first);

    expect(createFindings(first)).toBe(findings);
    expect(createVulnerabilities(first)).toBe(vulnerabilities);
    expect(createStatistics(first)).toBe(statistics);
    expect(createFindings(second)).not.toBe(findings);
    expect(createVulnerabilities(second)).not.toBe(vulnerabilities);
    expect(createStatistics(second)).not.toBe(statistics);
  });
});
