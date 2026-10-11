import type { ReactNode } from "react";

interface AppHeaderProps {
  accountMenu: ReactNode;
}

export default function AppHeader({ accountMenu }: AppHeaderProps) {
  return (
    <div className="px-3.5 py-2">
      <div className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-md text-primary">
              <img src="/logo.png" alt="ExposureNexus Logo" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium text-foreground">ExposureNexus</span>
              </div>
            </div>
          </div>
          {accountMenu}
        </div>
      </div>
    </div>
  );
}
