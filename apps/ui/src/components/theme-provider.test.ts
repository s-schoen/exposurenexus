import { afterEach, describe, expect, it } from "vitest";

import { THEME_STORAGE_KEY } from "@/components/theme-provider.tsx";

import indexHtml from "../../index.html?raw";

// index.html applies the stored theme before React loads, so a reload never flashes the other one.
const inlineScript =
  new DOMParser().parseFromString(indexHtml, "text/html").querySelector("script:not([src])")
    ?.textContent ?? "";
const originalMatchMedia = window.matchMedia;

function runWith({ stored, osDark }: { stored: string | null; osDark: boolean }) {
  if (stored !== null) {
    localStorage.setItem(THEME_STORAGE_KEY, stored);
  }
  window.matchMedia = (query: string) =>
    Object.assign(originalMatchMedia(query), { matches: osDark && query.includes("dark") });
  // oxlint-disable-next-line typescript/no-implied-eval -- runs index.html's own inline script.
  new Function(inlineScript)();
  return document.documentElement;
}

afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

describe("index.html theme script", () => {
  it.each([
    [null, false, "light"],
    [null, true, "dark"],
    ["system", true, "dark"],
    ["system", false, "light"],
    ["dark", false, "dark"],
    ["light", true, "light"],
  ])("stored %s with a dark OS %s applies %s", (stored, osDark, theme) => {
    const html = runWith({ stored, osDark });

    expect(html).toHaveClass(theme);
    expect(html.style.colorScheme).toBe(theme);
  });
});
