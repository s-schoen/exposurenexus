import { pino } from "pino";
import { describe, expect, it, vi } from "vitest";

import { createDefaultAdmin } from "./default-admin.js";

describe("default admin startup", () => {
  it("reports initial credentials only after backend bootstrap succeeds", async () => {
    const logger = pino({ enabled: false });
    const info = vi.spyOn(logger, "info");
    const users = { createInitialAdmin: vi.fn().mockResolvedValue({ username: "admin" }) };
    await createDefaultAdmin({ users, logger });
    const password = users.createInitialAdmin.mock.calls[0]![0];
    expect(password).toMatch(/^[a-f0-9-]{36}$/);
    expect(info).toHaveBeenCalledWith(`created admin user: username=admin, password=${password}`);
  });

  it("does not report credentials when a user already exists", async () => {
    const logger = pino({ enabled: false });
    const info = vi.spyOn(logger, "info");
    const debug = vi.spyOn(logger, "debug");
    await createDefaultAdmin({
      users: { createInitialAdmin: vi.fn().mockResolvedValue(null) },
      logger,
    });
    expect(info).not.toHaveBeenCalled();
    expect(debug).toHaveBeenCalledWith("admin user already exists");
  });

  it("propagates bootstrap failures without reporting credentials", async () => {
    const logger = pino({ enabled: false });
    const info = vi.spyOn(logger, "info");
    const failure = new Error("bootstrap failed");
    await expect(
      createDefaultAdmin({
        users: { createInitialAdmin: vi.fn().mockRejectedValue(failure) },
        logger,
      }),
    ).rejects.toBe(failure);
    expect(info).not.toHaveBeenCalled();
  });
});
