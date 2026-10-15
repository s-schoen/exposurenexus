import { isNotFound } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { APIError } from "@/lib/api-client.ts";
import { loadRecord } from "@/lib/load-error.ts";

describe("loadRecord", () => {
  it("resolves to the loaded record", async () => {
    await expect(loadRecord(Promise.resolve({ id: "a" }))).resolves.toEqual({ id: "a" });
  });

  it.each([404, 400])("turns a %i into the router's not-found", async (status) => {
    const failure = loadRecord(Promise.reject(new APIError(status, "missing")));

    await expect(failure.catch((error: unknown) => isNotFound(error))).resolves.toBe(true);
  });

  it("rethrows other failures", async () => {
    const error = new APIError(500, "Internal Server Error");

    await expect(loadRecord(Promise.reject(error))).rejects.toBe(error);
  });
});
