import { describe, expect, it } from "vitest";
import { z } from "zod/v4";

import { APIError } from "@/lib/api-client.ts";
import {
  formatCount,
  formatDate,
  formatDateTime,
  formatLoadError,
  formatShortDate,
  isMissingRecordError,
} from "@/lib/format.ts";

function zodError() {
  const result = z.object({ id: z.string() }).safeParse({});
  if (result.success) {
    throw new Error("expected a parse failure");
  }
  return result.error;
}

describe("formatCount", () => {
  it("uses the singular label for one item", () => {
    expect(formatCount(1, "asset")).toBe("1 asset");
  });

  it("uses the default plural label for zero and multiple items", () => {
    expect(formatCount(0, "asset")).toBe("0 assets");
    expect(formatCount(2, "asset")).toBe("2 assets");
  });

  it("uses a custom plural label", () => {
    expect(formatCount(2, "vulnerability", "vulnerabilities")).toBe("2 vulnerabilities");
  });
});

describe("formatDate", () => {
  it("shows the medium date", () => {
    const date = new Date(2026, 5, 7, 9);

    expect(formatDate(date)).toBe(date.toLocaleDateString(undefined, { dateStyle: "medium" }));
  });

  it("reads date-only values in UTC", () => {
    const date = new Date("2026-05-06T00:00:00.000Z");

    expect(formatDate(date, { timeZone: "UTC" })).toBe(
      date.toLocaleDateString(undefined, { dateStyle: "medium", timeZone: "UTC" }),
    );
  });
});

describe("formatDateTime", () => {
  it("shows the medium date with a short time", () => {
    const date = new Date(2026, 0, 8, 13, 30);

    expect(formatDateTime(date)).toBe(
      date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }),
    );
  });
});

describe("formatShortDate", () => {
  const today = new Date("2026-06-07T09:00:00.000Z");

  it("leaves out the current year", () => {
    const date = new Date("2026-02-01T12:00:00.000Z");

    expect(formatShortDate(date, { today })).toBe(
      date.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    );
  });

  it("shows other years", () => {
    const date = new Date("2025-02-01T12:00:00.000Z");

    expect(formatShortDate(date, { today })).toBe(
      date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }),
    );
  });

  it("reads date-only values in UTC", () => {
    const date = new Date("2026-05-06T00:00:00.000Z");

    expect(formatShortDate(date, { timeZone: "UTC", today })).toBe(
      date.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" }),
    );
  });
});

describe("isMissingRecordError", () => {
  it.each([
    [new APIError(404, "missing"), true],
    [new APIError(400, "bad id"), true],
    [new APIError(403, "forbidden"), false],
    [new Error("boom"), false],
  ])("%s → %s", (error, expected) => {
    expect(isMissingRecordError(error)).toBe(expected);
  });
});

describe("formatLoadError", () => {
  it.each([
    [new APIError(404, "asset with id 1 does not exist"), "Asset with id 1 does not exist."],
    [new APIError(409, "Already exists!"), "Already exists!"],
    [new APIError(403, "Forbidden"), "You don't have permission to view this."],
    [new APIError(502, "Bad Gateway"), "The server ran into a problem. Try again in a moment."],
    [
      new TypeError("Failed to fetch"),
      "Couldn't reach the server. Check your connection and try again.",
    ],
    [zodError(), "The server sent a reply the app doesn't understand."],
    [
      new Error("Cannot read properties of undefined"),
      "Something went wrong while loading this page.",
    ],
    ["nope", "Something went wrong while loading this page."],
  ])("%s", (error, message) => {
    expect(formatLoadError(error)).toBe(message);
  });
});
