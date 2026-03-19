import { Outlet, createFileRoute, redirect } from "@tanstack/react-router"
import { NuqsAdapter } from "nuqs/adapters/tanstack-router"
import { AppSidebar } from "@/components/app-sidebar.tsx"
import { SidebarProvider } from "@/components/ui/sidebar.tsx"
import { Toaster } from "@/components/ui/sonner.tsx"
import AppHeader from "@/components/app-header.tsx"
import { Separator } from "@/components/ui/separator.tsx"
import { usePage } from "@/context/page.tsx"
import { ConfirmDialog } from "@/components/confirm-dialog.tsx"
import { AssetDialog } from "@/components/asset-dialog.tsx"

function Layout() {
  const { title } = usePage()

  return (
    <>
      <ConfirmDialog.Root />
      <AssetDialog.Root />
      <Toaster />
      <div className="antialiased h-dvh flex flex-col overflow-hidden">
        <header className="shrink-0">
          <AppHeader />
        </header>
        <div className="flex-1 overflow-hidden">
          <SidebarProvider>
            <div className="flex h-full w-full">
              <AppSidebar />
              <main className="flex-1 overflow-y-auto p-2 flex flex-col">
                <span className="mt-1 text-2xl">{title}</span>
                <Separator className="my-3" />
                <NuqsAdapter>
                  <Outlet />
                </NuqsAdapter>
              </main>
            </div>
          </SidebarProvider>
        </div>
      </div>
    </>
  )
}

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ context, location }) => {
    const hasSession = await context.auth.ensureSession()

    if (!hasSession) {
      throw redirect({
        to: "/login",
        search: { redirect: location.href }
      })
    }
  },
  component: () => <Layout />
})
