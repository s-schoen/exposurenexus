import type { SourceLocation } from "./resource-identity.js";

/** Lines a span covers after its first; unknown without an end line. */
function lineCount(location: SourceLocation) {
  return location.endLine === undefined ? undefined : location.endLine - location.startLine;
}

function columnWidth(location: SourceLocation) {
  return location.startColumn === undefined || location.endColumn === undefined
    ? undefined
    : location.endColumn - location.startColumn;
}

/** Everything about a span except the line it starts on. */
function sameShape(left: SourceLocation, right: SourceLocation) {
  return (
    lineCount(left) === lineCount(right) &&
    left.startColumn === right.startColumn &&
    left.endColumn === right.endColumn
  );
}

/** Equal line count and column width, as after an indentation change. */
function sameWidth(left: SourceLocation, right: SourceLocation) {
  return lineCount(left) === lineCount(right) && columnWidth(left) === columnWidth(right);
}

function byPosition(left: SourceLocation, right: SourceLocation) {
  return (
    left.startLine - right.startLine ||
    (left.startColumn ?? 0) - (right.startColumn ?? 0) ||
    (left.endLine ?? 0) - (right.endLine ?? 0) ||
    (left.endColumn ?? 0) - (right.endColumn ?? 0)
  );
}

function fileOrder(locations: readonly SourceLocation[]) {
  return locations
    .map((_, position) => position)
    .sort((left, right) => byPosition(locations[left], locations[right]) || left - right);
}

/**
 * Pairs unmatched results with unclaimed findings in one file after code moved, without
 * reordering either side.
 *
 * Pairs with an equal span shape (line count and both columns) anchor the alignment: the
 * longest common subsequence in file order, with ties broken deterministically. Between two
 * anchors, a lone result and a lone finding also pair when their spans have equal width,
 * or when `anchored` says a symbol encloses both, as when an IaC block was resized.
 *
 * @param anchored Whether a real symbol, such as an IaC resource name, encloses both sides.
 * @returns Pairs of positions in `results` and `findings`.
 */
export function alignShifted(
  results: readonly SourceLocation[],
  findings: readonly SourceLocation[],
  anchored: boolean,
): [number, number][] {
  const left = fileOrder(results);
  const right = fileOrder(findings);
  const anchors = (i: number, j: number) => sameShape(results[left[i]], findings[right[j]]);

  // longest[i][j]: the most anchors among left[i..] and right[j..].
  const longest = Array.from({ length: left.length + 1 }, () =>
    Array.from({ length: right.length + 1 }, () => 0),
  );
  for (let i = left.length - 1; i >= 0; i--) {
    for (let j = right.length - 1; j >= 0; j--) {
      longest[i][j] = anchors(i, j)
        ? longest[i + 1][j + 1] + 1
        : Math.max(longest[i + 1][j], longest[i][j + 1]);
    }
  }

  const pairs: [number, number][] = [];
  let [gapLeft, gapRight] = [0, 0];
  const closeGap = (endLeft: number, endRight: number) => {
    if (
      endLeft - gapLeft === 1 &&
      endRight - gapRight === 1 &&
      (anchored || sameWidth(results[left[gapLeft]], findings[right[gapRight]]))
    ) {
      pairs.push([left[gapLeft], right[gapRight]]);
    }
  };

  let [i, j] = [0, 0];
  while (i < left.length && j < right.length) {
    if (anchors(i, j)) {
      closeGap(i, j);
      pairs.push([left[i], right[j]]);
      [i, j] = [i + 1, j + 1];
      [gapLeft, gapRight] = [i, j];
    } else if (longest[i + 1][j] >= longest[i][j + 1]) {
      i += 1;
    } else {
      j += 1;
    }
  }
  closeGap(left.length, right.length);
  return pairs;
}
