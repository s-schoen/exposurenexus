import { ThemeProvider as NextThemesProvider } from "next-themes";

import type { ReactNode } from "react";

/** Where the theme choice is kept. The inline script in `index.html` reads the same key. */
export const THEME_STORAGE_KEY = "exposurenexus-theme";

export const THEME_OPTIONS = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
] as const;

// next-themes' own inline script only runs in server-rendered HTML; `index.html` applies the theme
// before first paint instead. Typing the script as data stops React warning about it.
const INERT_SCRIPT_PROPS = { type: "application/json" };

/** The color theme: System (the default) follows the OS live, Light and Dark pin it. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      storageKey={THEME_STORAGE_KEY}
      scriptProps={INERT_SCRIPT_PROPS}
    >
      {children}
    </NextThemesProvider>
  );
}
