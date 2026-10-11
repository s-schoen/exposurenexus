import { usePage } from "@/hooks/use-page-meta.tsx";

const SETTINGS_PATH = /^\/settings(?:\/.*)?$/;

export function isSettingsPath(pathname: string) {
  return SETTINGS_PATH.test(pathname);
}

// Settings pages sit in a centered column under a 24px title. The title is the page's heading
// here, so the page header shows it as plain text.
export function SettingsColumn({ children }: { children: React.ReactNode }) {
  const { title } = usePage();

  return (
    <div className="mx-auto w-full max-w-200 pt-5">
      <h1 className="mb-6 truncate text-2xl font-medium text-foreground">{title}</h1>
      {children}
    </div>
  );
}
