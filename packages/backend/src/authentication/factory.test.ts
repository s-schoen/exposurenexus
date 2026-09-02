import { pino } from "pino";
import { describe, expect, it } from "vitest";

import { createBackendRuntime } from "../runtime.js";
import { createAuthentication } from "./authentication.js";

const logger = pino({ enabled: false });
const database = {} as never;
const configuration = {
  sessionLifetimeHours: 12,
  sessionHmacSecret: "012345678901234567890123456789012345678901234567890123456789",
};

describe("authentication capability construction", () => {
  it("memoizes one authentication capability per runtime without database I/O", () => {
    const firstRuntime = createBackendRuntime({ database, logger });
    const secondRuntime = createBackendRuntime({ database, logger });

    const firstAuthentication = createAuthentication(firstRuntime, configuration);

    expect(createAuthentication(firstRuntime, configuration)).toBe(firstAuthentication);
    expect(createAuthentication(secondRuntime, configuration)).not.toBe(firstAuthentication);
    expect(firstAuthentication).toEqual({
      createSessionForCredentials: expect.any(Function),
      createSession: expect.any(Function),
      validateSession: expect.any(Function),
      revokeSession: expect.any(Function),
    });
    expect(firstAuthentication).not.toHaveProperty("userHasPermission");
  });
});
