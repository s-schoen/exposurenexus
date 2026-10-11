import { Link, useLocation } from "@tanstack/react-router";
import { Bug, Inbox, LayoutGrid, Plus, Server, Settings, ShieldAlert } from "lucide-react";

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

// Until the Settings area exists, Settings opens the users page and covers every admin page.
const settingsItem: NavItem = {
  title: "Settings",
  url: "/users",
  icon: Settings,
  activeMatch: /^\/(?:users|roles|custom-fields)(?:\/.+)?$/,
};

export function AppSidebar({ triageCount }: AppSidebarProps) {
  const { isMobile, setOpenMobile } = useSidebar();
  const closeMobile = () => setOpenMobile(false);

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
