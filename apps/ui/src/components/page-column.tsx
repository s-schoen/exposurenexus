import { usePage } from "@/hooks/use-page-meta.tsx";

const SETTINGS_PATH = /^\/settings(?:\/.*)?$/;
const SETTINGS_DETAIL_PATH = /^\/settings\/[^/]+\/(?!new\/?$)[^/]+\/?$/;
const FORM_PATH = /\/(?:new|edit)\/?$/;

export function isSettingsPath(pathname: string) {
  return SETTINGS_PATH.test(pathname);
}

/**
 * Whether a page sits in the centered page column. Create and edit forms, settings lists and the
 * Settings landing page do; a settings detail page uses the full-width detail layout, as every
 * other detail page does.
 */
export function isPageColumnPath(pathname: string) {
  return (
    FORM_PATH.test(pathname) || (isSettingsPath(pathname) && !SETTINGS_DETAIL_PATH.test(pathname))
  );
}

// Forms and settings lists sit in a centered column under a 24px title. The title is the page's
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
