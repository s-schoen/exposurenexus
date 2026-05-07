import {
  Bug,
  ClipboardCheck,
  Home,
  KeyRound,
  Server,
  ShieldAlert,
  Tags,
  UploadCloud,
  Users
} from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import { Link, useLocation } from "@tanstack/react-router"
import { FindingStatus } from "@exposurenexus/types/model/finding"
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
import { createFindingStatsQueryOptions } from "@/api/finding.ts"
import { cn } from "@/lib/utils"

interface SidebarItem {
  title: string
  url: string
  icon: React.ComponentType<{ className?: string }>
  description: string
  badge?: number
  activeMatch?: RegExp
}

export function AppSidebar() {
  const location = useLocation()
  const findingStats = useQuery(createFindingStatsQueryOptions())
  const triageCount = findingStats.data?.status[FindingStatus.Active] ?? 0
  const mitigationCount =
    findingStats.data?.status[FindingStatus.Confirmed] ?? 0

  const isItemActive = (item: SidebarItem) => {
    if (item.activeMatch) {
      return item.activeMatch.test(location.pathname)
    }

    return (
      location.pathname === item.url ||
      location.pathname.startsWith(`${item.url}/`)
    )
  }

  const groups: Array<{ label: string; items: Array<SidebarItem> }> = [
    {
      label: "Explore",
      items: [
        {
          title: "Dashboard",
          url: "/",
          icon: Home,
          description: "Overview and triage",
          activeMatch: /^\/$/
        },
        {
          title: "Assets",
          url: "/assets",
          icon: Server,
          description: "Systems in scope",
          activeMatch: /^\/assets(?:\/.+)?$/
        },
        {
          title: "Triage queue",
          url: "/findings/triage",
          icon: ClipboardCheck,
          description: "Active findings to review",
          badge: triageCount,
          activeMatch: /^\/findings\/triage$/
        },
        {
          title: "Findings",
          url: "/findings",
          icon: ShieldAlert,
          description: "Issues with your assets",
          badge: mitigationCount,
          activeMatch: /^\/findings(?:\/(?!import$|triage$).+)?$/
        },
        {
          title: "Vulnerabilities",
          url: "/vulnerabilities",
          icon: Bug,
          description: "Catalog of vulnerabilities",
          activeMatch: /^\/vulnerabilities(?:\/.+)?$/
        }
      ]
    },
    {
      label: "Manage",
      items: [
        {
          title: "Users",
          url: "/users",
          icon: Users,
          description: "Platform access and accounts",
          activeMatch: /^\/users(?:\/.+)?$/
        },
        {
          title: "Roles",
          url: "/roles",
          icon: KeyRound,
          description: "Manage permissions",
          activeMatch: /^\/roles(?:\/.+)?$/
        },
        {
          title: "Custom Fields",
          url: "/custom-fields",
          icon: Tags,
          description: "Asset metadata schema",
          activeMatch: /^\/custom-fields(?:\/.+)?$/
        },
        {
          title: "Import",
          url: "/findings/import",
          icon: UploadCloud,
          description: "Ingest external findings",
          activeMatch: /^\/findings\/import$/
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
                      isActive={isItemActive(item)}
                      className={cn(
                        "h-auto min-h-14 rounded-2xl px-3 py-3",
                        "data-active:bg-sidebar-primary data-active:text-sidebar-primary-foreground data-active:shadow-sm",
                        "hover:bg-sidebar-accent/80"
                      )}
                      render={
                        <Link to={item.url}>
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="relative flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/80 text-current ring-1 ring-sidebar-border/70">
                              <item.icon className="size-4.5" />
                              {typeof item.badge === "number" &&
                                item.badge > 0 && (
                                  <span className="absolute -top-1 -right-1 flex min-w-5 items-center justify-center rounded-full bg-sidebar-primary px-1.5 py-0.5 text-[10px] font-semibold leading-none text-sidebar-primary-foreground shadow-sm ring-2 ring-sidebar">
                                    {item.badge}
                                  </span>
                                )}
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
