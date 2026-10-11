import { Link, useLocation } from "@tanstack/react-router";
import {
  ArrowLeft,
  Bug,
  Inbox,
  KeyRound,
  LayoutGrid,
  Plus,
  Server,
  Settings,
  ShieldAlert,
  Tags,
  Users,
} from "lucide-react";
import { useState } from "react";

import { isSettingsPath } from "@/components/page-column.tsx";
import { buttonVariants } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

import type { ParsedLocation } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";

interface NavItem {
  title: string;
  url: string;
  icon: LucideIcon;
  activeMatch: RegExp;
  count?: number;
}

interface AppSidebarProps {
  triageCount: number;
}

type SidebarMode = "main" | "settings";

const settingsItem: NavItem = {
  title: "Settings",
  url: "/settings/users",
  icon: Settings,
  activeMatch: /^\/settings(?:\/.*)?$/,
};
const accessItems: Array<NavItem> = [
  {
    title: "Users",
    url: "/settings/users",
    icon: Users,
    activeMatch: /^\/settings\/users(?:\/.+)?$/,
  },
  {
    title: "Roles",
    url: "/settings/roles",
    icon: KeyRound,
    activeMatch: /^\/settings\/roles(?:\/.+)?$/,
  },
];
const assetSettingsItems: Array<NavItem> = [
  {
    title: "Custom fields",
    url: "/settings/custom-fields",
    icon: Tags,
    activeMatch: /^\/settings\/custom-fields(?:\/.+)?$/,
  },
];

export function AppSidebar({ triageCount }: AppSidebarProps) {
  const { isMobile, setOpenMobile } = useSidebar();
  const closeMobile = () => setOpenMobile(false);
  const location = useLocation();
  const mode: SidebarMode = isSettingsPath(location.pathname) ? "settings" : "main";

  // The nav only animates when the mode changes, not on first render. Leaving Settings goes back
  // to the last page seen outside it.
  const [nav, setNav] = useState<{
    mode: SidebarMode;
    animate: boolean;
    returnTo: Pick<ParsedLocation, "href" | "pathname" | "search"> | undefined;
  }>({ mode, animate: false, returnTo: undefined });
  if (nav.mode !== mode) {
    setNav({ ...nav, mode, animate: true });
  } else if (mode === "main" && nav.returnTo?.href !== location.href) {
    setNav({ ...nav, returnTo: location });
  }

  const workItems: Array<NavItem> = [
    { title: "Dashboard", url: "/", icon: LayoutGrid, activeMatch: /^\/$/ },
    {
      title: "Triage",
      url: "/findings/triage",
      icon: Inbox,
      activeMatch: /^\/findings\/triage$/,
      count: triageCount,
    },
  ];
  const exposureItems: Array<NavItem> = [
    {
      title: "Findings",
      url: "/findings",
      icon: ShieldAlert,
      activeMatch: /^\/findings(?:\/(?!triage$).+)?$/,
    },
    { title: "Assets", url: "/assets", icon: Server, activeMatch: /^\/assets(?:\/.+)?$/ },
    {
      title: "Vulnerabilities",
      url: "/vulnerabilities",
      icon: Bug,
      activeMatch: /^\/vulnerabilities(?:\/.+)?$/,
    },
  ];

  return (
    // On desktop the sidebar sits in the sheet; on phones it slides in as a sheet of its own.
    <div className="flex shrink-0 md:border-r md:border-border">
      <Sidebar collapsible={isMobile ? "offcanvas" : "none"}>
        <div
          key={mode}
          data-mode={mode}
          className={cn(
            "flex min-h-0 flex-1 flex-col",
            nav.animate && "animate-nav-enter",
            nav.animate && mode === "main" && "nav-enter-from-left",
          )}
        >
          {mode === "settings" ? (
            <>
              <SidebarHeader>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      variant="nav"
                      render={
                        <Link
                          to={nav.returnTo?.pathname ?? "/"}
                          search={nav.returnTo?.search ?? {}}
                          onClick={closeMobile}
                          aria-label="Leave Settings"
                        >
                          <ArrowLeft strokeWidth={1.5} />
                          <span className="flex-1 truncate">Settings</span>
                        </Link>
                      }
                    />
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarHeader>
              <SidebarContent>
                <NavGroup label="Access" items={accessItems} onNavigate={closeMobile} />
                <NavGroup label="Assets" items={assetSettingsItems} onNavigate={closeMobile} />
              </SidebarContent>
            </>
          ) : (
            <>
              <SidebarHeader>
                <Link
                  to="/findings/new"
                  onClick={closeMobile}
                  className={cn(buttonVariants({ variant: "outline", size: "lg" }), "w-full")}
                >
                  <Plus />
                  New finding
                </Link>
              </SidebarHeader>
              <SidebarContent>
                <NavGroup items={workItems} onNavigate={closeMobile} />
                <NavGroup label="Exposure" items={exposureItems} onNavigate={closeMobile} />
              </SidebarContent>
              <SidebarFooter>
                <NavMenu items={[settingsItem]} onNavigate={closeMobile} />
              </SidebarFooter>
            </>
          )}
        </div>
      </Sidebar>
    </div>
  );
}

function NavGroup({
  label,
  items,
  onNavigate,
}: {
  label?: string;
  items: Array<NavItem>;
  onNavigate: () => void;
}) {
  return (
    <SidebarGroup className="py-0">
      {label && <SidebarGroupLabel>{label}</SidebarGroupLabel>}
      <NavMenu items={items} onNavigate={onNavigate} />
    </SidebarGroup>
  );
}

function NavMenu({ items, onNavigate }: { items: Array<NavItem>; onNavigate: () => void }) {
  const { pathname } = useLocation();

  return (
    <SidebarMenu className="gap-0.5">
      {items.map((item) => (
        <SidebarMenuItem key={item.title}>
          <SidebarMenuButton
            variant="nav"
            isActive={item.activeMatch.test(pathname)}
            render={
              <Link to={item.url} onClick={onNavigate}>
                <item.icon strokeWidth={1.5} />
                <span className="flex-1 truncate">{item.title}</span>
                {item.count !== undefined && item.count > 0 && (
                  <span className="font-normal text-muted-foreground tabular-nums">
                    {item.count}
                  </span>
                )}
              </Link>
            }
          />
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
}
