import { test as base, expect } from "@playwright/test";

import type { ConsoleMessage, Page } from "@playwright/test";

/** A console error, warning or uncaught page error that a test can declare as expected. */
type ConsolePattern = string | RegExp;

interface ConsoleEntry {
  kind: "console.error" | "console.warning" | "pageerror";
  text: string;
  location?: string;
}

interface ConsoleGuard {
  /** Declares console errors or warnings matching `pattern` as expected for this test. */
  allow: (pattern: ConsolePattern) => void;
}

// React's render loop guard. Never allowed: catching this class of bug is why the guard exists.
const RENDER_LOOP = /Maximum update depth exceeded/;

function matches(text: string, pattern: ConsolePattern): boolean {
  return typeof pattern === "string" ? text.includes(pattern) : pattern.test(text);
}

function formatLocation(message: ConsoleMessage): string | undefined {
  const { url, lineNumber } = message.location();
  return url ? `${url}:${lineNumber}` : undefined;
}

function collectConsole(page: Page): Array<ConsoleEntry> {
  const entries: Array<ConsoleEntry> = [];
  page.on("console", (message) => {
    const type = message.type();
    if (type === "error" || type === "warning") {
      entries.push({
        kind: `console.${type}`,
        text: message.text(),
        location: formatLocation(message),
      });
    }
  });
  page.on("pageerror", (error) => {
    entries.push({ kind: "pageerror", text: `${error.name}: ${error.message}` });
  });
  return entries;
}

export const test = base.extend<{ consoleGuard: ConsoleGuard; reloadGuard: void }>({
  // Fails the test on any console error, warning or uncaught error it did not declare with
  // `consoleGuard.allow(…)`. Automatic, so every journey is guarded.
  consoleGuard: [
    async ({ page }, use) => {
      const entries = collectConsole(page);
      const allowed: Array<ConsolePattern> = [];

      await use({ allow: (pattern) => allowed.push(pattern) });

      const unexpected = entries.filter(
        (entry) =>
          RENDER_LOOP.test(entry.text) || !allowed.some((pattern) => matches(entry.text, pattern)),
      );
      if (unexpected.length > 0) {
        const lines = unexpected.map(
          (entry) =>
            `- ${entry.kind}: ${entry.text}${entry.location ? ` (${entry.location})` : ""}`,
        );
        throw new Error(`Unexpected browser console output:\n${lines.join("\n")}`);
      }
    },
    { auto: true },
  ],
  // The mock API keeps its data in memory per page load, so a full reload after the first `goto`
  // silently resets it. Fail with that cause instead of a confusing missing-data assertion.
  reloadGuard: [
    async ({ page }, use) => {
      let loads = 0;
      page.on("load", () => {
        loads += 1;
      });

      await use();

      if (loads > 1) {
        throw new Error(
          `The page fully loaded ${loads} times, which resets the mock data. Navigate ` +
            "client-side after the first page.goto (a Vite reload shows in the dev server output).",
        );
      }
    },
    { auto: true },
  ],
});

export { expect };

/** The `<main>` of the current page; the app shell nests the page's own `<main>` inside. */
export function pageContent(page: Page) {
  return page.getByRole("main").last();
}
