import { formatWithOptions } from "node:util";

import { vi } from "vitest";

/** Decides whether one `console.error`/`console.warn` call, given its arguments, is expected. */
export type ConsoleMatcher = (args: ReadonlyArray<unknown>) => boolean;

type ConsoleLevel = "error" | "warn";

/**
 * Third-party warnings jsdom can't avoid; matching warnings are dropped in every test.
 * Each entry says why it can't be fixed here.
 */
const IGNORED_WARNINGS: Array<ConsoleMatcher> = [
  // Recharts measures its container with getBoundingClientRect, which is 0×0 in jsdom. Charts
  // render in the Playwright smoke suite (e2e/).
  matchText("of chart should be greater than 0"),
];

const expectedLogs: Array<ConsoleMatcher> = [];
const unexpectedLogs: Array<{ level: ConsoleLevel; args: ReadonlyArray<unknown> }> = [];

/** Matches a call when a string argument or an error message contains `text`. */
export function matchText(text: string): ConsoleMatcher {
  return (args) =>
    args.some(
      (arg) =>
        (typeof arg === "string" && arg.includes(text)) ||
        (arg instanceof Error && arg.message.includes(text)),
    );
}

/**
 * Declares that the current test logs an error or warning, e.g. for a forced API failure, so the
 * log doesn't fail the test. `match` is text in the message or a matcher over the call's
 * arguments. Any other log fails the test.
 */
export function expectConsoleLog(match: string | ConsoleMatcher): void {
  expectedLogs.push(typeof match === "string" ? matchText(match) : match);
}

/**
 * Records `console.error`/`console.warn` calls for the current test instead of printing them.
 * Called by `setup.ts` before each test. Tests that assert on a log read the spy with
 * `vi.mocked(console.error)`; they must not replace its implementation.
 */
export function filterConsole(): void {
  vi.spyOn(console, "error").mockImplementation((...args) => record("error", args));
  vi.spyOn(console, "warn").mockImplementation((...args) => record("warn", args));
}

function record(level: ConsoleLevel, args: ReadonlyArray<unknown>): void {
  const allowed = level === "warn" ? [...expectedLogs, ...IGNORED_WARNINGS] : expectedLogs;
  if (!allowed.some((matches) => matches(args))) {
    unexpectedLogs.push({ level, args });
  }
}

/**
 * Restores `console` and forgets the current test's expected logs. Throws, failing the test,
 * when the test logged an error or warning it didn't declare with `expectConsoleLog`.
 */
export function restoreConsole(): void {
  expectedLogs.length = 0;
  for (const log of [console.error, console.warn]) {
    if (vi.isMockFunction(log)) {
      log.mockRestore();
    }
  }

  const logs = unexpectedLogs.splice(0);
  if (logs.length > 0) {
    const details = logs
      .map(({ level, args }) => `console.${level}: ${formatWithOptions({ depth: 3 }, ...args)}`)
      .join("\n\n");
    throw new Error(
      `The test logged ${logs.length} unexpected error(s) or warning(s). Fix the cause, or ` +
        `declare an expected log with expectConsoleLog() from @/test/console.ts.\n\n${details}`,
    );
  }
}
