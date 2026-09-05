import { pino } from "pino";
import { describe, expect, it } from "vitest";

import { createBackendRuntime } from "../runtime.js";
import { createExposures } from "./exposures.js";

const database = {} as never;
const logger = pino({ enabled: false });

describe("exposures capability construction", () => {
  it("memoizes one capability per runtime without authentication configuration", () => {
    const firstRuntime = createBackendRuntime({ database, logger });
    const secondRuntime = createBackendRuntime({ database, logger });

    const firstExposures = createExposures(firstRuntime);

    expect(createExposures(firstRuntime)).toBe(firstExposures);
    expect(createExposures(secondRuntime)).not.toBe(firstExposures);
    expect(firstExposures).toEqual({
      findings: expect.any(Object),
      vulnerabilities: expect.any(Object),
      statistics: expect.any(Object),
    });
  });
});
