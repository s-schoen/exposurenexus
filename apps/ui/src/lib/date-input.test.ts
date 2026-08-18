import { afterEach, describe, expect, it, vi } from "vitest";

import { formatLocalDateTimeInput, formatUtcDateOnly } from "@/lib/date-input.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("date input formatting", () => {
  it("preserves UTC calendar dates", () => {
    expect(formatUtcDateOnly(new Date("2026-05-06T00:00:00.000Z"))).toBe("2026-05-06");
  });

  it("formats datetime-local values as local wall time", () => {
    vi.spyOn(Date.prototype, "getTimezoneOffset").mockReturnValue(300);

    expect(formatLocalDateTimeInput(new Date("2026-05-06T14:30:00.000Z"))).toBe("2026-05-06T09:30");
  });
});
