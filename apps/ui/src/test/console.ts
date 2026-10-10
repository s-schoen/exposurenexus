import { vi } from "vitest";

/** Decides whether one `console.error`/`console.warn` call, given its arguments, is expected. */
export type ConsoleMatcher = (args: ReadonlyArray<unknown>) => boolean;

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
 * log stays out of the test output. `match` is text in the message or a matcher over the call's
 * arguments. Other logs still print.
 */
export function expectConsoleLog(match: string | ConsoleMatcher): void {
  expectedLogs.push(typeof match === "string" ? matchText(match) : match);
}

/**
 * Drops expected logs and ignored warnings for the current test. Called by `setup.ts` before
 * each test; tests that spy on `console` themselves replace this filter for that test.
 */
export function filterConsole(): void {
  const error = console.error.bind(console);
  const warn = console.warn.bind(console);

  vi.spyOn(console, "error").mockImplementation((...args) => {
    if (!expectedLogs.some((matches) => matches(args))) {
      error(...args);
    }
  });
  vi.spyOn(console, "warn").mockImplementation((...args) => {
    const ignored = [...expectedLogs, ...IGNORED_WARNINGS].some((matches) => matches(args));
    if (!ignored) {
      warn(...args);
    }
  });
}

/** Restores `console` and forgets the current test's expected logs. */
export function restoreConsole(): void {
  expectedLogs.length = 0;
  for (const log of [console.error, console.warn]) {
    if (vi.isMockFunction(log)) {
      log.mockRestore();
    }
  }
}
