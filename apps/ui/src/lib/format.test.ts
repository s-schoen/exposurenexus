import { describe, expect, it } from "vitest";

import { formatCount, formatDate, formatDateTime, formatShortDate } from "@/lib/format.ts";

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
