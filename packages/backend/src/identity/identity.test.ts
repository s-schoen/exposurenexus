import { pino } from "pino";
import { describe, expect, it } from "vitest";

import { createBackendRuntime } from "../runtime.js";
import { createIdentity } from "./identity.js";

const logger = pino({ enabled: false });
const database = {} as never;

describe("identity capability construction", () => {
  it("memoizes one identity capability per runtime without database I/O", () => {
    const firstRuntime = createBackendRuntime({ database, logger });
    const secondRuntime = createBackendRuntime({ database, logger });

    const firstIdentity = createIdentity(firstRuntime);

    expect(createIdentity(firstRuntime)).toBe(firstIdentity);
    expect(createIdentity(secondRuntime)).not.toBe(firstIdentity);
    expect(firstIdentity).toEqual({
      users: expect.any(Object),
      roles: expect.any(Object),
      authorization: expect.any(Object),
    });
  });
});
