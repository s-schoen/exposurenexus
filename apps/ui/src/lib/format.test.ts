import { describe, expect, it } from "vitest";

import { formatCount, formatDate, formatRelativeTime, formatShortDate } from "@/lib/format.ts";

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
  it("uses the runtime locale date representation", () => {
    const date = new Date("2026-06-07T09:00:00.000Z");

    expect(formatDate(date)).toBe(date.toLocaleDateString());
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

describe("formatRelativeTime", () => {
  const now = new Date("2026-06-07T09:00:00.000Z");
  const ago = (seconds: number) => new Date(now.getTime() - seconds * 1000);
  const format = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

  it("uses the largest whole unit", () => {
    expect(formatRelativeTime(ago(2 * 24 * 60 * 60 + 300), now)).toBe(format.format(-2, "day"));
    expect(formatRelativeTime(ago(3 * 60 * 60), now)).toBe(format.format(-3, "hour"));
    expect(formatRelativeTime(ago(400 * 24 * 60 * 60), now)).toBe(format.format(-1, "year"));
  });

  it("treats anything under a minute as now", () => {
    expect(formatRelativeTime(ago(20), now)).toBe(format.format(0, "minute"));
  });
});
