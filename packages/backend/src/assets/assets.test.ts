import { pino } from "pino";
import { describe, expect, it } from "vitest";

import { createBackendRuntime } from "../runtime.js";
import { createAssets } from "./assets.js";

const logger = pino({ enabled: false });
const database = {} as never;

describe("assets capability construction", () => {
  it("memoizes one assets capability per runtime without authentication configuration", () => {
    const firstRuntime = createBackendRuntime({ database, logger });
    const secondRuntime = createBackendRuntime({ database, logger });

    const firstAssets = createAssets(firstRuntime);

    expect(createAssets(firstRuntime)).toBe(firstAssets);
    expect(createAssets(secondRuntime)).not.toBe(firstAssets);
    expect(firstAssets).toEqual({
      inventory: expect.any(Object),
      customFields: expect.any(Object),
    });
  });
});
