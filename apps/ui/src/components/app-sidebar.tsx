import { Bug, Home, Server, ShieldAlert, UploadCloud } from "lucide-react"
import { Link } from "@tanstack/react-router"
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
                  <SidebarMenuButton
                    render={
                      <Link to={item.url}>
                        <item.icon />
                        <span className="select-none">{item.title}</span>
                      </Link>
                    }
                  ></SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
