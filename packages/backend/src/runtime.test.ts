import { describe, expect, it, vi } from "vitest";

import {
  createBackendRuntime,
  getOrCreateRuntimeValue,
  getRuntimeDatabase,
  getRuntimeLogger,
} from "./runtime.js";

function createRuntime() {
  const database = {} as never;
  const logger = {} as never;
  return {
    database,
    logger,
    runtime: createBackendRuntime({ database, logger }),
  };
}

describe("backend runtime", () => {
  it("retains its explicit process resources without accessing them during construction", () => {
    const { database, logger, runtime } = createRuntime();

    expect(getRuntimeDatabase(runtime)).toBe(database);
    expect(getRuntimeLogger(runtime)).toBe(logger);
    expect(Object.keys(runtime)).toEqual([]);
    expect(Object.isFrozen(runtime)).toBe(true);
  });

  it("memoizes values within one runtime without sharing them across runtimes", () => {
    const firstRuntime = createRuntime().runtime;
    const secondRuntime = createRuntime().runtime;
    const key = {};
    const createFirst = vi.fn(() => ({ runtime: "first" }));
    const createSecond = vi.fn(() => ({ runtime: "second" }));

    const firstValue = getOrCreateRuntimeValue(firstRuntime, key, createFirst);

    expect(getOrCreateRuntimeValue(firstRuntime, key, createFirst)).toBe(firstValue);
    expect(createFirst).toHaveBeenCalledOnce();
    expect(getOrCreateRuntimeValue(secondRuntime, key, createSecond)).toEqual({
      runtime: "second",
    });
    expect(createSecond).toHaveBeenCalledOnce();
  });
});
