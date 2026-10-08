import { describe, expect, it } from "vitest";

import { alignShifted } from "./drift-pairing.js";

import type { SourceLocation } from "./resource-identity.js";

function span(startLine: number, startColumn: number, endColumn: number, lines = 0) {
  return { startLine, startColumn, endLine: startLine + lines, endColumn };
}

function sorted(pairs: [number, number][]) {
  return [...pairs].sort(([left], [right]) => left - right);
}

describe("alignShifted", () => {
  it("pairs results shifted together by span shape, whatever the input order", () => {
    const findings = [span(10, 5, 40), span(25, 9, 30, 2), span(40, 5, 61)];
    const results = [span(46, 5, 61), span(16, 5, 40), span(31, 9, 30, 2)];
    expect(sorted(alignShifted(results, findings, false))).toEqual([
      [0, 2],
      [1, 0],
      [2, 1],
    ]);
  });

  it("never pairs across the order of the file", () => {
    const findings = [span(10, 5, 40), span(30, 7, 22)];
    const results = [span(12, 7, 22), span(50, 5, 40)];
    expect(alignShifted(results, findings, false)).toHaveLength(1);
  });

  it("pairs a lone result and finding of equal width between anchors", () => {
    const findings = [span(10, 5, 40), span(20, 3, 50), span(30, 5, 40)];
    const results = [span(11, 5, 40), span(21, 5, 52), span(31, 5, 40)];
    expect(sorted(alignShifted(results, findings, false))).toEqual([
      [0, 0],
      [1, 1],
      [2, 2],
    ]);
  });

  it("leaves a result unpaired when its span changed and no symbol anchors it", () => {
    const findings = [span(32, 5, 103)];
    const results = [span(37, 7, 79)];
    expect(alignShifted(results, findings, false)).toEqual([]);
  });

  it("pairs a resized block when a symbol anchors both sides", () => {
    const block = (startLine: number, endLine: number): SourceLocation => ({ startLine, endLine });
    expect(alignShifted([block(14, 27)], [block(10, 20)], true)).toEqual([[0, 0]]);
    expect(alignShifted([block(14, 27)], [block(10, 20)], false)).toEqual([]);
  });

  it("pairs nothing in a gap holding several results or findings", () => {
    const findings = [span(10, 5, 40)];
    const results = [span(12, 3, 18), span(40, 9, 30)];
    expect(alignShifted(results, findings, true)).toEqual([]);
  });

  it("aligns locations without columns by line count alone", () => {
    expect(alignShifted([{ startLine: 8 }], [{ startLine: 5 }], false)).toEqual([[0, 0]]);
    expect(alignShifted([], [{ startLine: 5 }], false)).toEqual([]);
  });
});
