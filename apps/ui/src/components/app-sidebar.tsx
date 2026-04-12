import { Bug, Home, Server, ShieldAlert, UploadCloud } from "lucide-react"
import { Link, useLocation } from "@tanstack/react-router"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator
} from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"

export function AppSidebar() {
  const location = useLocation()

  const isItemActive = (url: string) => {
    if (url === "/") {
      return location.pathname === url
    }

    if (url === "/findings") {
      return (
        location.pathname === url ||
        (location.pathname.startsWith(`${url}/`) &&
          !location.pathname.startsWith("/findings/import"))
      )
    }

    return location.pathname === url || location.pathname.startsWith(`${url}/`)
  }

  const groups = [
    {
      label: "Explore",
      items: [
        {
          title: "Dashboard",
          url: "/",
          icon: Home,
          description: "Overview and triage"
        },
        {
          title: "Assets",
          url: "/assets",
          icon: Server,
          description: "Systems in scope"
        },
        {
          title: "Findings",
          url: "/findings",
          icon: ShieldAlert,
          description: "Issues with your assets"
        },
        {
          title: "Vulnerabilities",
          url: "/vulnerabilities",
          icon: Bug,
          description: "Catalog of vulnerabilities"
        }
      ]
    },
    {
      label: "Manage",
      items: [
        {
          title: "Import",
          url: "/findings/import",
          icon: UploadCloud,
          description: "Ingest external findings"
        }
      ]
    }
  ]

  return (
    <Sidebar
      variant="inset"
      className="border-r-0 md:top-18.25 md:h-[calc(100svh-73px)]"
    >
      <SidebarSeparator className="mx-3" />
      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.label} className="px-3 py-2">
            <SidebarGroupLabel className="px-3 text-[11px] font-semibold tracking-[0.18em] uppercase text-sidebar-foreground/55">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-1.5">
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      isActive={isItemActive(item.url)}
                      className={cn(
                        "h-auto min-h-14 rounded-2xl px-3 py-3",
                        "data-active:bg-sidebar-primary data-active:text-sidebar-primary-foreground data-active:shadow-sm",
                        "hover:bg-sidebar-accent/80"
                      )}
                      render={
                        <Link to={item.url}>
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/80 text-current ring-1 ring-sidebar-border/70">
                              <item.icon className="size-4.5" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium select-none">
                                {item.title}
                              </span>
                              <span className="block truncate text-xs text-current/65 select-none">
                                {item.description}
                              </span>
                            </div>
                          </div>
                        </Link>
                      }
                    />
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  )
}
