import { SidebarTrigger } from "@/components/ui/sidebar";

import type { ReactNode } from "react";

interface AppHeaderProps {
  accountMenu: ReactNode;
}

export default function AppHeader({ accountMenu }: AppHeaderProps) {
  return (
    <div className="flex h-11 items-center justify-between gap-3 px-3.5">
      <div className="flex min-w-0 items-center gap-2">
        <SidebarTrigger className="md:hidden" />
        <img src="/logo.png" alt="ExposureNexus Logo" className="size-5 shrink-0" />
        <span className="truncate text-sm font-medium text-foreground">ExposureNexus</span>
      </div>
      {accountMenu}
    </div>
  );
}
