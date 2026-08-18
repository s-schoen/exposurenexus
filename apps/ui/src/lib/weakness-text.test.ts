import { describe, expect, it } from "vitest";

import { formatWeaknessText, parseWeaknessText } from "@/lib/weakness-text.ts";

describe("weakness text", () => {
  it("formats and parses namespaced identifiers", () => {
    const weakness = { identifiers: { cve: ["CVE-2026-0001"], cwe: ["CWE-89"] } };

    expect(formatWeaknessText(weakness)).toBe("cve=CVE-2026-0001; cwe=CWE-89");
    expect(parseWeaknessText(" cve=CVE-2026-0001 ; cwe=CWE-89 ")).toEqual(weakness);
  });

  it("returns an empty weakness for blank text", () => {
    expect(parseWeaknessText("  ")).toEqual({ identifiers: {} });
  });

  it("can reject or ignore malformed entries", () => {
    const value = "invalid; cwe=CWE-89";

    expect(parseWeaknessText(value)).toBeNull();
    expect(parseWeaknessText(value, { ignoreMalformed: true })).toEqual({
      identifiers: { cwe: ["CWE-89"] },
    });
  });
});
