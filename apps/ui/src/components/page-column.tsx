import { usePage } from "@/hooks/use-page-meta.tsx";

const SETTINGS_PATH = /^\/settings(?:\/.*)?$/;
const EDIT_PATH = /\/edit\/?$/;

export function isSettingsPath(pathname: string) {
  return SETTINGS_PATH.test(pathname);
}

/**
 * Whether a page sits in the centered page column. Only edit forms do; lists, settings lists
 * included, render full width. Create forms open in a `FormDialog` instead.
 */
export function isPageColumnPath(pathname: string) {
  return EDIT_PATH.test(pathname);
}

// Edit forms sit in a centered column under a 24px title. The title is the page's
// heading here, so the page header shows it as plain text.
export function PageColumn({ children }: { children: React.ReactNode }) {
  const { title } = usePage();

  return (
    <div className="mx-auto w-full max-w-200 pt-5">
      <h1 className="mb-6 truncate text-2xl font-medium text-foreground">{title}</h1>
      {children}
    </div>
  );
}
