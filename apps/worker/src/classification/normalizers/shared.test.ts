import { describe, expect, it, vi } from "vitest";

import { readCweIdentifier, renderCodeBlock, renderEvidenceSection } from "./shared.js";

describe("renderCodeBlock", () => {
  it.each([
    ["plain", "```\nplain\n```"],
    ["a `tick` and ``two``", "```\na `tick` and ``two``\n```"],
    ["```\nfenced\n```", "````\n```\nfenced\n```\n````"],
    ["`````", "``````\n`````\n``````"],
  ])("uses a fence that %j cannot close", (content, expected) => {
    expect(renderCodeBlock(content)).toBe(expected);
  });

  it("wraps evidence sections in the same backtick-safe fence", () => {
    expect(renderEvidenceSection("Response", "```\n<script>\n")).toBe(
      "<details><summary>Response</summary>\n\n````\n```\n<script>\n\n````\n\n</details>",
    );
  });
});

describe("readCweIdentifier", () => {
  it.each([
    ["CWE-79", "CWE-79"],
    [" cwe-079 ", "CWE-79"],
    ["0079", "CWE-79"],
  ])("canonicalizes %j", (value, expected) => {
    const warn = vi.fn();
    expect(readCweIdentifier(value, "cwe", warn)).toBe(expected);
    expect(warn).not.toHaveBeenCalled();
  });

  it.each(["CWE-0", "000", "", "CWE-79: label", 79, null])("warns about %j", (value) => {
    const warn = vi.fn();
    expect(readCweIdentifier(value, "cwe", warn)).toBeUndefined();
    expect(warn).toHaveBeenCalledExactlyOnceWith("cwe");
  });
});
