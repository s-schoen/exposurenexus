import { Home, Server, ShieldAlert, UploadCloud, Bug } from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem
} from "@/components/ui/sidebar"
import { Link } from "@tanstack/react-router"

export function AppSidebar() {
  const items = [
    {
      title: "Dashboard",
      url: "/",
      icon: Home
    },
    {
      title: "Assets",
      url: "/assets",
      icon: Server
    },
    {
      title: "Findings",
      url: "/findings",
      icon: ShieldAlert
    },
    {
      title: "Vulnerabilities",
      url: "/vulnerabilities",
      icon: Bug
    },
    {
      title: "Import",
      url: "/findings/import",
      icon: UploadCloud
    }
  ]

  return (
    <Sidebar>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>OpenVLP</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <Link to={item.url}>
                      <item.icon />
                      <span className="select-none">{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
