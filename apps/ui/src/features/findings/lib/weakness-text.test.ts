import { describe, expect, it } from "vitest";

import {
  formatWeaknessIdentifier,
  formatWeaknessText,
  parseWeaknessText,
} from "@/features/findings/lib/weakness-text.ts";

describe("formatWeaknessIdentifier", () => {
  it("doesn't repeat a namespace the identifier already names", () => {
    expect(formatWeaknessIdentifier("cwe", "CWE-284")).toBe("CWE-284");
    expect(formatWeaknessIdentifier("ghsa", "GHSA-abcd-1234-efgh")).toBe("GHSA-abcd-1234-efgh");
  });

  it("prefixes other identifiers with their namespace", () => {
    expect(formatWeaknessIdentifier("scanner", "admin-panel")).toBe("scanner:admin-panel");
  });
});

describe("weakness text", () => {
  it("formats and parses namespaced identifiers", () => {
    const weakness = { identifiers: { cve: ["CVE-2026-0001"], cwe: ["CWE-89"] } };

    expect(formatWeaknessText(weakness)).toBe("cve=CVE-2026-0001; cwe=CWE-89");
    expect(parseWeaknessText(" cve=CVE-2026-0001 ; cwe=CWE-89 ")).toEqual(weakness);
  });

  it("returns an empty weakness for blank text", () => {
    expect(parseWeaknessText("  ")).toEqual({ identifiers: {} });
  });

  it("rejects malformed entries", () => {
    const value = "invalid; cwe=CWE-89";

    expect(parseWeaknessText(value)).toBeNull();
  });

  it("preserves enrichment from the base weakness when identifiers change", () => {
    const base = {
      identifiers: { cwe: ["CWE-89"] },
      references: ["https://example.com/advisory", "https://example.com/advisory"],
      cvss: [{ score: 9.8, vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H" }],
      epss: { score: 0, percentile: 0.997 },
    };

    expect(parseWeaknessText("scanner=admin-panel", base)).toEqual({
      ...base,
      identifiers: { scanner: ["admin-panel"] },
    });
    expect(formatWeaknessText(base)).toBe("cwe=CWE-89");
    expect(parseWeaknessText("", base)).toEqual({ ...base, identifiers: {} });
  });
});
