import { usePage } from "@/hooks/use-page-meta.tsx";

const SETTINGS_PATH = /^\/settings(?:\/.*)?$/;
const SETTINGS_DETAIL_PATH = /^\/settings\/[^/]+\/(?!new\/?$)[^/]+\/?$/;

export function isSettingsPath(pathname: string) {
  return SETTINGS_PATH.test(pathname);
}

/**
 * Whether a page sits in the centered settings column. Settings lists and forms do; a settings
 * detail page uses the full-width detail layout, as every other detail page does.
 */
export function isSettingsColumnPath(pathname: string) {
  return isSettingsPath(pathname) && !SETTINGS_DETAIL_PATH.test(pathname);
}

// Settings lists and forms sit in a centered column under a 24px title. The title is the page's
// heading here, so the page header shows it as plain text.
export function SettingsColumn({ children }: { children: React.ReactNode }) {
  const { title } = usePage();

  return (
    <div className="mx-auto w-full max-w-200 pt-5">
      <h1 className="mb-6 truncate text-2xl font-medium text-foreground">{title}</h1>
      {children}
    </div>
  );
}
