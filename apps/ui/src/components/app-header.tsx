import { Shield } from "lucide-react"
import { AccountMenu } from "@/components/account-menu"
import { SidebarTrigger } from "@/components/ui/sidebar"

export default function AppHeader() {
  return (
    <div className="border-b border-shell-border-strong/80 bg-shell-panel-strong/90 px-3 py-3 backdrop-blur xl:px-5">
      <div className="flex items-center gap-3">
        <SidebarTrigger
          className="shrink-0 md:hidden"
          aria-label="Toggle navigation"
        />
        <div className="flex min-w-0 flex-1 items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/12 text-primary ring-1 ring-primary/15">
              <Shield className="size-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate text-base font-semibold tracking-tight text-foreground">
                  OpenVLP
                </span>
              </div>
            </div>
          </div>
          <AccountMenu />
        </div>
      </div>
    </div>
  )
}
